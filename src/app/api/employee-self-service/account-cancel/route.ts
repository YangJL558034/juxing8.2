import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeByRequest } from '@/lib/employee-session';
import { sendEmail } from '@/lib/email';
import { verifyToken } from '@/lib/auth';

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_account_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER,
      employee_name TEXT,
      id_card TEXT,
      request_type TEXT DEFAULT '注销',
      reason TEXT,
      status TEXT DEFAULT '待处理',
      created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
      processed_at TEXT,
      processed_by TEXT
    )
  `);
}

function adminEmails(): string[] {
  const rows = db.prepare(`
    SELECT email FROM users
    WHERE role IN ('admin', 'super_admin') AND email IS NOT NULL AND email <> ''
  `).all() as Array<{ email: string }>;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return Array.from(new Set(
    rows.map((row) => String(row.email).trim())
      .filter((email) => re.test(email) && !email.endsWith('@example.com')),
  ));
}

/** 员工提交账号注销申请（不会立刻删除人事档案，由 HR 处理） */
export async function POST(request: NextRequest) {
  try {
    const session = getEmployeeByRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }

    ensureTable();

    const employee = db.prepare('SELECT name, id_card, department FROM employees WHERE id = ?')
      .get(session.id) as { name: string; id_card: string | null; department: string | null } | undefined;
    if (!employee) {
      return NextResponse.json({ success: false, error: '员工不存在' }, { status: 404 });
    }

    const pending = db.prepare(`
      SELECT id FROM employee_account_requests WHERE employee_id = ? AND status = '待处理' LIMIT 1
    `).get(session.id) as { id: number } | undefined;
    if (pending) {
      return NextResponse.json({ success: true, duplicated: true, message: '注销申请已提交，正在处理中' });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const reason = String((body as Record<string, unknown>)?.reason || '').trim();

    const result = db.prepare(`
      INSERT INTO employee_account_requests (employee_id, employee_name, id_card, request_type, reason)
      VALUES (?, ?, ?, '注销', ?)
    `).run(session.id, employee.name, employee.id_card || '', reason);

    db.prepare(`
      INSERT INTO operation_logs (user_id, username, module, action, description, created_at)
      VALUES (?, ?, 'employee', 'delete', ?, datetime('now', '+8 hours'))
    `).run(session.id, employee.name, `提交账号注销申请（${employee.department || '-'}）`);

    // 邮件通知管理员（失败不影响提交结果）
    const recipients = adminEmails();
    if (recipients.length > 0) {
      const html = `
        <div style="font-family:-apple-system,'PingFang SC',sans-serif;color:#1f2937;">
          <h2 style="color:#dc2626;">员工账号注销申请</h2>
          <p>员工 <strong>${employee.name}</strong>（${employee.department || '-'}）在小程序提交了账号注销申请。</p>
          <p>原因：${reason || '未填写'}</p>
          <p style="color:#6b7280;font-size:12px;">请登录后台确认是否停用该员工的小程序登录权限。人事档案不会自动删除。</p>
        </div>`;
      for (const to of recipients) {
        await sendEmail(to, `【聚星】账号注销申请：${employee.name}`, html).catch(() => undefined);
      }
    }

    return NextResponse.json({
      success: true,
      id: Number(result.lastInsertRowid),
      message: '注销申请已提交，HR 处理后账号将停用',
    });
  } catch (error) {
    console.error('Account cancel request error:', error);
    return NextResponse.json({ success: false, error: '提交失败，请稍后重试' }, { status: 500 });
  }
}

/** 管理员：查看注销申请列表 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }
    ensureTable();
    const status = new URL(request.url).searchParams.get('status')?.trim();
    const where = status ? 'WHERE status = ?' : '';
    const rows = db.prepare(`
      SELECT id, employee_id, employee_name, id_card, request_type, reason, status,
             created_at, processed_at, processed_by
      FROM employee_account_requests ${where}
      ORDER BY id DESC
    `).all(...(status ? [status] : [])) as Array<Record<string, unknown>>;

    return NextResponse.json({
      success: true,
      records: rows.map((row) => ({
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        idCard: String(row.id_card || '').length >= 10
          ? `${String(row.id_card).slice(0, 6)}********${String(row.id_card).slice(-4)}`
          : (row.id_card || ''),
        requestType: row.request_type,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at,
        processedAt: row.processed_at,
        processedBy: row.processed_by,
      })),
    });
  } catch (error) {
    console.error('List account cancel requests error:', error);
    return NextResponse.json({ success: false, error: '获取注销申请失败' }, { status: 500 });
  }
}

/** 管理员：处理注销申请（同意/驳回） */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }
    ensureTable();
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const id = Number((body as Record<string, unknown>)?.id);
    const action = String((body as Record<string, unknown>)?.action || '');
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    const nextStatus = action === 'approve' ? '已处理' : '已驳回';
    const updated = db.prepare(`
      UPDATE employee_account_requests
      SET status = ?, processed_at = datetime('now', '+8 hours'), processed_by = ?
      WHERE id = ? AND status = '待处理'
    `).run(nextStatus, user.name || user.username || '', id);

    if (updated.changes === 0) {
      return NextResponse.json({ success: false, error: '该申请不存在或已处理' }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO operation_logs (username, module, action, description, created_at)
      VALUES (?, 'employee', 'review', ?, datetime('now', '+8 hours'))
    `).run(user.name || user.username || '', `处理账号注销申请 #${id}：${nextStatus}`);

    return NextResponse.json({ success: true, status: nextStatus });
  } catch (error) {
    console.error('Review account cancel request error:', error);
    return NextResponse.json({ success: false, error: '处理失败' }, { status: 500 });
  }
}
