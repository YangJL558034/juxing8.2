import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { normalizeLaborContractTerminationData, parseLaborContractTerminationRow, type LaborContractTerminationDbRow } from '@/lib/labor-contract-termination-records';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

function resolveEmployeeCategory(name: string): 'management' | 'production' {
  const employee = db.prepare('SELECT department, location FROM employees WHERE name = ? LIMIT 1')
    .get(name) as { department: string | null; location: string | null } | undefined;
  if (!employee) return 'management';
  const location = String(employee.location || '');
  if (location.includes('办公室')) return 'management';
  if (location.includes('车间')) return 'production';
  return /生产|车间|产线|流水/.test(String(employee.department || '')) ? 'production' : 'management';
}

function hasSignedContract(name: string) {
  const employee = db.prepare('SELECT id, id_card FROM employees WHERE name = ? LIMIT 1')
    .get(name) as { id: number; id_card: string | null } | undefined;
  if (!employee) return false;
  const row = db.prepare(`
    SELECT contract_status FROM social_security_purchase_records
    WHERE deleted_at IS NULL
      AND (employee_id = ? OR (id_card IS NOT NULL AND id_card <> '' AND id_card = ?))
    ORDER BY id DESC LIMIT 1
  `).get(employee.id, employee.id_card || '') as { contract_status: string | null } | undefined;
  const status = String(row?.contract_status || '');
  return status.includes('已签') || status.includes('正常');
}

function hasTerminationRecord(name: string) {
  // 包含已软删的记录：删掉后不要被自动生成逻辑又建回来
  const row = db.prepare(`
    SELECT id FROM labor_contract_termination_records
    WHERE employee_name = ? LIMIT 1
  `).get(name) as { id: number } | undefined;
  return Boolean(row);
}

function addDays(dateStr: string, days: number) {
  const parsed = new Date(`${dateStr}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  parsed.setDate(parsed.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * 辞职审核通过 + 已签劳动合同 + 还没登记解除的员工，自动生成一条解除通知书，
 * 这样在列表里就能直接查看/修改/导出/打印/删除（沿用原有模板）。
 */
function materializeResignationTerminations() {
  const rows = db.prepare(`
    SELECT r.id, r.name, r.department, r.resignation_date, r.reviewed_at
    FROM resignation_records r
    WHERE r.status = '已审核' AND r.deleted_at IS NULL
    ORDER BY r.id DESC
  `).all() as Array<{
    id: number;
    name: string;
    department: string | null;
    resignation_date: string | null;
    reviewed_at: string | null;
  }>;

  const created: string[] = [];
  for (const row of rows) {
    if (hasTerminationRecord(row.name)) continue;
    if (!hasSignedContract(row.name)) continue;

    const terminationDate = (row.resignation_date || '').slice(0, 10) || row.resignation_date || '';
    if (!terminationDate) continue;

    const data = normalizeLaborContractTerminationData({
      employeeName: row.name,
      honorific: '先生',
      terminationDate,
      reason: '员工主动提出辞职，双方协商一致解除劳动合同',
      procedureDeadline: addDays(terminationDate, 7),
      noticeDate: (row.reviewed_at || '').slice(0, 10) || terminationDate,
    });

    db.prepare(`
      INSERT INTO labor_contract_termination_records (
        employee_name, honorific, termination_date, reason, procedure_deadline,
        company_name, notice_date, data_json, created_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.employeeName,
      data.honorific,
      data.terminationDate,
      data.reason,
      data.procedureDeadline,
      data.companyName,
      data.noticeDate,
      JSON.stringify(data),
      '系统自动生成（辞职通过）',
    );
    created.push(row.name);
  }
  return created;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword')?.trim();
    const deleted = searchParams.get('deleted') === '1';
    const where: string[] = [];
    const params: unknown[] = [];

    db.prepare("DELETE FROM labor_contract_termination_records WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '+8 hours', '-7 days')").run();

    if (deleted) {
      where.push("deleted_at IS NOT NULL AND deleted_at >= datetime('now', '+8 hours', '-7 days')");
    } else {
      where.push('deleted_at IS NULL');
    }
    if (keyword) {
      where.push('(employee_name LIKE ? OR reason LIKE ? OR company_name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // 辞职已通过且已签合同的员工，自动补一条解除通知书（仅"在用记录"时执行）
    if (!deleted) {
      materializeResignationTerminations();
    }

    const rows = db.prepare(`
      SELECT * FROM labor_contract_termination_records
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC
    `).all(...params) as LaborContractTerminationDbRow[];

    const category = searchParams.get('category')?.trim();
    const records = rows
      .map((row) => {
        const record = parseLaborContractTerminationRow(row);
        return { ...record, category: resolveEmployeeCategory(record.employeeName) };
      })
      .filter((record) => !category || category === 'all' || record.category === category);

    // 员工辞职审核通过 + 已签劳动合同 + 还没登记解除 → 也显示在解除页面（待办理）
    const resignationRows = db.prepare(`
      SELECT r.id, r.name, r.department, r.resignation_date, r.reviewed_at, r.reviewer_name
      FROM resignation_records r
      WHERE r.status = '已审核' AND r.deleted_at IS NULL
      ORDER BY r.reviewed_at DESC, r.id DESC
    `).all() as Array<{
      id: number;
      name: string;
      department: string | null;
      resignation_date: string | null;
      reviewed_at: string | null;
      reviewer_name: string | null;
    }>;

    const resignationApplicants = resignationRows
      .filter((row) => !hasTerminationRecord(row.name) && hasSignedContract(row.name))
      .map((row) => ({
        id: row.id,
        employeeName: row.name,
        department: row.department || '',
        category: resolveEmployeeCategory(row.name),
        resignationDate: row.resignation_date || '',
        reviewedAt: row.reviewed_at || '',
        reviewerName: row.reviewer_name || '',
      }))
      .filter((row) => !category || category === 'all' || row.category === category);

    return NextResponse.json({ success: true, records, resignationApplicants });
  } catch (error) {
    console.error('Get labor contract termination records error:', error);
    return NextResponse.json({ success: false, error: '获取解除劳动合同通知书失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });

    const body = await request.json();
    const data = normalizeLaborContractTerminationData(body?.data || body);

    if (!data.employeeName) return NextResponse.json({ success: false, error: '员工姓名不能为空' }, { status: 400 });
    if (!data.terminationDate) return NextResponse.json({ success: false, error: '解除日期不能为空' }, { status: 400 });
    if (!data.reason) return NextResponse.json({ success: false, error: '解除原因不能为空' }, { status: 400 });
    if (!data.procedureDeadline) return NextResponse.json({ success: false, error: '离职手续办理截止日期不能为空' }, { status: 400 });
    if (!data.noticeDate) return NextResponse.json({ success: false, error: '通知日期不能为空' }, { status: 400 });

    const result = db.prepare(`
      INSERT INTO labor_contract_termination_records (
        employee_name, honorific, termination_date, reason, procedure_deadline,
        company_name, notice_date, data_json, created_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.employeeName,
      data.honorific,
      data.terminationDate,
      data.reason,
      data.procedureDeadline,
      data.companyName,
      data.noticeDate,
      JSON.stringify(data),
      user.name || user.username || '',
    );

    const row = db.prepare('SELECT * FROM labor_contract_termination_records WHERE id = ?').get(result.lastInsertRowid) as LaborContractTerminationDbRow;
    return NextResponse.json({
      success: true,
      record: parseLaborContractTerminationRow(row),
      message: '解除劳动合同通知书已保存',
    });
  } catch (error) {
    console.error('Create labor contract termination record error:', error);
    return NextResponse.json({ success: false, error: '保存解除劳动合同通知书失败' }, { status: 500 });
  }
}
