import { NextRequest, NextResponse } from 'next/server';
import { db, logOperationServer } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { isOfficeEmployee, getProbationRequired, chinaToday, addMonths, daysBetween, PROBATION_MONTHS } from '@/lib/probation';
import { normalizeRegularizationData } from '@/lib/regularization-records';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * 试用期员工列表
 * - 仅办公室岗位、且 HR 审核时勾选了「需要试用期」
 * - 已有已审核转正记录的不再出现（已转正式工）
 * - 返回倒计时、是否已提交转正申请
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });

    const today = chinaToday();
    const employees = db.prepare(`
      SELECT id, name, department, position, hire_date, location, probation_required
      FROM employees
      WHERE COALESCE(status, '在职') NOT IN ('离职', '已离职')
        AND hire_date IS NOT NULL AND TRIM(hire_date) <> ''
      ORDER BY hire_date DESC, id DESC
    `).all() as Array<{
      id: number;
      name: string;
      department: string | null;
      position: string | null;
      hire_date: string;
      location: string | null;
      probation_required: number | null;
    }>;

    const items = employees
      .filter((employee) => isOfficeEmployee(employee))
      .filter((employee) => Number(employee.probation_required ?? 1) !== 0)
      .map((employee) => {
        const hireDate = String(employee.hire_date).slice(0, 10);
        const probationEnd = addMonths(hireDate, PROBATION_MONTHS);
        const daysLeft = probationEnd ? daysBetween(today, probationEnd) : 0;

        const latest = db.prepare(`
          SELECT status, regularization_date FROM regularization_records
          WHERE deleted_at IS NULL AND (employee_id = ? OR applicant_name = ?)
          ORDER BY id DESC LIMIT 1
        `).get(employee.id, employee.name) as { status: string; regularization_date: string | null } | undefined;

        return {
          employeeId: employee.id,
          name: employee.name,
          department: String(employee.department || ''),
          position: String(employee.position || ''),
          hireDate,
          probationEnd,
          daysLeft,
          overdue: daysLeft < 0,
          appliedStatus: latest?.status || '',
          regularDate: String(latest?.regularization_date || '').slice(0, 10),
        };
      })
      // 已审核 = 已转正，归到「已审核」里，不再属于试用期
      .filter((item) => item.appliedStatus !== '已审核');

    return NextResponse.json(
      { success: true, total: items.length, items },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Get probation list error:', error);
    return NextResponse.json({ success: false, error: '获取试用期员工失败' }, { status: 500 });
  }
}

/** 管理员手动把试用期员工转为正式工（直接生成已审核的转正记录） */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const employeeId = Number((body as Record<string, unknown>)?.employeeId);
    if (!Number.isFinite(employeeId)) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    const employee = db.prepare('SELECT id, name, department, position, hire_date FROM employees WHERE id = ?')
      .get(employeeId) as { id: number; name: string; department: string | null; position: string | null; hire_date: string | null } | undefined;
    if (!employee) return NextResponse.json({ success: false, error: '员工不存在' }, { status: 404 });

    const existing = db.prepare(`
      SELECT id FROM regularization_records
      WHERE deleted_at IS NULL AND status = '已审核' AND (employee_id = ? OR applicant_name = ?)
      LIMIT 1
    `).get(employeeId, employee.name) as { id: number } | undefined;
    if (existing) {
      return NextResponse.json({ success: false, error: '该员工已是正式员工' }, { status: 400 });
    }

    const today = chinaToday();
    const data = normalizeRegularizationData({
      applicantName: employee.name,
      department: employee.department || '',
      position: employee.position || '',
      hireDate: String(employee.hire_date || '').slice(0, 10),
      regularizationDate: today,
      hrOpinion: '管理员后台手动转为正式员工',
      reviewerName: user.name || user.username || '',
    });

    db.prepare(`
      INSERT INTO regularization_records (
        status, applicant_name, department, position, hire_date,
        regularization_date, data_json, employee_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '已审核',
      data.applicantName,
      data.department,
      data.position,
      data.hireDate,
      data.regularizationDate,
      JSON.stringify({ ...data, manualApproved: true }),
      employeeId,
    );

    logOperationServer({
      userId: user.id,
      userName: user.name || user.username,
      module: 'personnel',
      action: 'manual_regularization',
      details: { employeeId, employeeName: employee.name, regularizationDate: today },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    return NextResponse.json({ success: true, message: `${employee.name} 已转为正式员工` });
  } catch (error) {
    console.error('Manual regularization error:', error);
    return NextResponse.json({ success: false, error: '转正失败' }, { status: 500 });
  }
}
