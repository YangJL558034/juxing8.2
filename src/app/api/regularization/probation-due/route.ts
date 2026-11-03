import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { getProbationRequired } from '@/lib/probation';

/** 试用期统一 1 个月；提前 20 天提醒 HR（仅办公室岗位） */
const PROBATION_MONTHS = 1;
const REMIND_DAYS = 20;

/** 办公室 / 车间判定：优先 location，其次部门名称 */
function isOfficeEmployee(employee: { location?: string | null; department?: string | null }) {
  const location = String(employee.location || '').trim();
  if (location) return location === '办公室';
  const department = String(employee.department || '');
  return !/生产|车间|产线|流水/.test(department);
}

function chinaToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addMonths(dateStr: string, months: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from}T00:00:00+08:00`);
  const b = Date.parse(`${to}T00:00:00+08:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const today = chinaToday();
    const employees = db.prepare(`
      SELECT id, name, department, position, hire_date, location
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
    }>;

    const all = employees
      .filter((employee) => isOfficeEmployee(employee))
      // HR 审核时设为「不需要试用期」的不提醒
      .filter((employee) => getProbationRequired(employee.id))
      .map((employee) => {
        const hireDate = String(employee.hire_date).slice(0, 10);
        const probationEnd = addMonths(hireDate, PROBATION_MONTHS);
        if (!probationEnd) return null;

        // 已有转正申请（待审核/已审核）就不提醒
        const applied = db.prepare(`
          SELECT status FROM regularization_records
          WHERE deleted_at IS NULL AND (employee_id = ? OR applicant_name = ?)
          ORDER BY id DESC LIMIT 1
        `).get(employee.id, employee.name) as { status: string } | undefined;
        if (applied && ['待审核', '已审核', '已通过'].includes(String(applied.status))) return null;

        const daysLeft = daysBetween(today, probationEnd);
        // 超过 60 天的历史数据不再反复提醒（多半是没登记转正，需要 HR 补录）
        if (daysLeft < -60) return null;
        if (daysLeft > REMIND_DAYS) return null;

        return {
          employeeId: employee.id,
          name: employee.name,
          department: String(employee.department || ''),
          position: String(employee.position || ''),
          hireDate,
          probationEnd,
          daysLeft,
          overdue: daysLeft < 0,
        };
      })
      .filter(Boolean) as Array<{
        employeeId: number;
        name: string;
        department: string;
        position: string;
        hireDate: string;
        probationEnd: string;
        daysLeft: number;
        overdue: boolean;
      }>;

    const dueSoon = all.filter((item) => !item.overdue).sort((a, b) => a.daysLeft - b.daysLeft);
    const overdue = all.filter((item) => item.overdue).sort((a, b) => b.daysLeft - a.daysLeft);

    return NextResponse.json(
      {
        success: true,
        remindDays: REMIND_DAYS,
        total: all.length,
        dueSoon,
        overdue,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Get probation due list error:', error);
    return NextResponse.json({ success: false, error: '获取待转正提醒失败' }, { status: 500 });
  }
}
