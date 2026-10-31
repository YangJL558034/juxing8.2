import { NextRequest, NextResponse } from 'next/server';
import { db, query } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { hasPermission } from '@/lib/permission-check';
import { getEmployeeByRequest as getEmployeeSession } from '@/lib/employee-session';
import {
  parseLeaveRequestRow,
  type LeaveRequestDbRow,
} from '@/lib/leave-records';

interface MonthlyRecordRow {
  [key: string]: unknown;
  id: number;
  employee_id: number;
}

interface EmployeeIdLookup {
  id: number;
}

interface EmployeeContext {
  id: number;
  name: string;
  id_card: string | null;
  department: string | null;
  location?: string | null;
}

interface WorkHoursImportItem {
  employeeId?: number;
  employeeName?: string;
  totalDays?: number;
  workHours?: number;
  overtimeHours?: number;
  weekendOvertime?: number;
  details?: unknown;
}

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

function findCurrentEmployee(user: { id: number; username: string; name: string }) {
  return db.prepare(`
    SELECT id, name, id_card, department, location
    FROM employees
    WHERE user_id = ?
       OR name = ?
       OR employee_id = ?
    ORDER BY CASE WHEN user_id = ? THEN 0 WHEN name = ? THEN 1 ELSE 2 END
    LIMIT 1
  `).get(user.id, user.name, user.username, user.id, user.name) as EmployeeContext | undefined;
}

function getEmployeeMonthlyRecords(employee: EmployeeContext, year?: string | null, month?: string | null) {
  const where = [
    'w.year BETWEEN 2000 AND 2100',
    'w.month_num BETWEEN 1 AND 12',
    `(
      w.employee_id = ?
      OR (
        w.employee_name = ?
        AND NOT EXISTS (
          SELECT 1 FROM employees linked_employee WHERE linked_employee.id = w.employee_id
        )
      )
    )`,
  ];
  const params: unknown[] = [employee.id, employee.name];

  if (year) {
    where.push('w.year = ?');
    params.push(parseInt(year, 10));
  }
  if (month) {
    where.push('w.month_num = ?');
    params.push(parseInt(month, 10));
  }

  return db.prepare(`
    SELECT
      w.*,
      ? as employee_id,
      COALESCE(NULLIF(w.employee_name, ''), ?) as employee_name,
      COALESCE(NULLIF(w.department, ''), ?) as department,
      ? as id_card,
      COALESCE(NULLIF(w.location, ''), ?) as location
    FROM work_hours_monthly w
    WHERE ${where.join(' AND ')}
    ORDER BY w.year DESC, w.month_num DESC, w.id DESC
  `).all(employee.id, employee.name, employee.department || '', employee.id_card || '', employee.location || '', ...params);
}

function getApprovedLeaveRequests(year?: string | null, month?: string | null, employee?: EmployeeContext | null) {
  const where = [
    'deleted_at IS NULL',
    "status = '已审核'",
  ];
  const params: unknown[] = [];

  if (year && month) {
    const normalizedMonth = String(parseInt(month, 10)).padStart(2, '0');
    const daysInMonth = new Date(parseInt(year, 10), parseInt(normalizedMonth, 10), 0).getDate();
    where.push(`
      COALESCE(leave_start_date, leave_date) <= ?
      AND COALESCE(leave_end_date, leave_start_date, leave_date) >= ?
    `);
    params.push(`${year}-${normalizedMonth}-${String(daysInMonth).padStart(2, '0')}`, `${year}-${normalizedMonth}-01`);
  } else if (year) {
    where.push(`
      COALESCE(leave_start_date, leave_date) <= ?
      AND COALESCE(leave_end_date, leave_start_date, leave_date) >= ?
    `);
    params.push(`${year}-12-31`, `${year}-01-01`);
  }

  if (employee) {
    where.push(`(
      employee_id = ?
      OR id_card = ?
      OR (
        employee_name = ?
        AND (department = '' OR department = ?)
      )
    )`);
    params.push(employee.id, employee.id_card || '', employee.name, employee.department || '');
  }

  const rows = db.prepare(`
    SELECT *
    FROM leave_request_records
    WHERE ${where.join(' AND ')}
    ORDER BY leave_date DESC, created_at DESC, id DESC
  `).all(...params) as LeaveRequestDbRow[];

  return rows.map(parseLeaveRequestRow);
}

// 获取工时月份汇总
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    const employeeId = searchParams.get('employeeId');

    // 小程序员工端：没有管理员 JWT 时，用 employee_session 认证并只返回本人工资
    if (!user) {
      const session = getEmployeeSession(request);
      if (!session) {
        return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
      }
      const employee = db.prepare('SELECT id, name, id_card, department, location FROM employees WHERE id = ?')
        .get(session.id) as EmployeeContext | undefined;
      const records = employee ? getEmployeeMonthlyRecords(employee, year, month) : [];
      const leaveRecords = employee ? getApprovedLeaveRequests(year, month, employee) : [];
      return NextResponse.json({ success: true, data: records, leaveRecords, selfOnly: true });
    }

    const canManageSalary = hasPermission(user, 'salary');

    if (!canManageSalary) {
      const employee = findCurrentEmployee(user);
      const records = employee ? getEmployeeMonthlyRecords(employee, year, month) : [];
      const leaveRecords = employee ? getApprovedLeaveRequests(year, month, employee) : [];
      return NextResponse.json({ success: true, data: records, leaveRecords, selfOnly: true });
    }
    
    let records;
    let scopedEmployee: EmployeeContext | null = null;
    if (employeeId) {
      const parsedEmployeeId = parseInt(employeeId, 10);
      const employee = db.prepare('SELECT id, name, id_card, department, location FROM employees WHERE id = ?').get(parsedEmployeeId) as EmployeeContext | undefined;
      if (employee?.name) {
        scopedEmployee = employee;
        records = db.prepare(`
          SELECT
            w.*,
            ? as employee_id,
            COALESCE(NULLIF(w.employee_name, ''), ?) as employee_name,
            COALESCE(NULLIF(w.department, ''), ?) as department,
            ? as id_card,
            COALESCE(NULLIF(w.location, ''), ?) as location
          FROM work_hours_monthly w
          WHERE w.year BETWEEN 2000 AND 2100
            AND w.month_num BETWEEN 1 AND 12
            AND (
              w.employee_id = ?
              OR (
                w.employee_name = ?
                AND NOT EXISTS (
                  SELECT 1 FROM employees linked_employee WHERE linked_employee.id = w.employee_id
                )
              )
            )
          ORDER BY w.year DESC, w.month_num DESC, w.id DESC
        `).all(parsedEmployeeId, employee.name, employee.department || '', employee.id_card || '', employee.location || '', parsedEmployeeId, employee.name);
      } else {
        records = query.getWorkHoursMonthlyByEmployee.all(parsedEmployeeId);
      }
    } else if (year && month) {
      records = query.getWorkHoursMonthlyByYearMonth.all(parseInt(year), parseInt(month));
    } else if (month) {
      records = query.getWorkHoursMonthlyByMonth.all(month);
    } else {
      records = query.getWorkHoursMonthly.all();
    }
    
    const leaveRecords = employeeId
      ? (scopedEmployee ? getApprovedLeaveRequests(year, month, scopedEmployee) : [])
      : getApprovedLeaveRequests(year, month, null);
    return NextResponse.json({ success: true, data: records, leaveRecords });
  } catch (error) {
    console.error('Get work hours monthly error:', error);
    return NextResponse.json({ error: '获取工时数据失败' }, { status: 500 });
  }
}

// 导入工时数据或创建工资记录
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }
    if (!hasPermission(user, 'salary')) {
      return NextResponse.json({ success: false, error: '无权管理工资工时' }, { status: 403 });
    }

    const body = await request.json();
    
    // 检查是否是新的工资记录格式
    if (body.employee_name && body.year && body.month) {
      // 新格式：工资记录导入
      const { 
        employee_id, 
        employee_name, 
        year, 
        month, 
        normal_hours, 
        weekday_overtime, 
        weekend_overtime,
        base_salary,
        normal_pay,
        weekday_overtime_pay,
        weekend_overtime_pay,
        total_payable,
        deduction,
        actual_amount,
        location
      } = body;

      const yearNumber = Number(year);
      const monthNumber = Number(month);
      if (
        !Number.isInteger(yearNumber) ||
        !Number.isInteger(monthNumber) ||
        yearNumber < 2000 ||
        yearNumber > 2100 ||
        monthNumber < 1 ||
        monthNumber > 12
      ) {
        return NextResponse.json({ error: '年份或月份不合法' }, { status: 400 });
      }
      
      // 检查是否已存在该记录
      const existing = query.getWorkHoursMonthlyByYearMonth.all(yearNumber, monthNumber) as MonthlyRecordRow[];
      const existingRecord = existing.find((r) => r.employee_id === employee_id);
      
      if (existingRecord) {
        // 更新现有记录
        db.prepare(`
          UPDATE work_hours_monthly SET 
            employee_name = ?, normal_hours = ?, weekday_overtime = ?, weekend_overtime = ?,
            base_salary = ?, normal_pay = ?, weekday_overtime_pay = ?, weekend_overtime_pay = ?,
            total_payable = ?, deduction = ?, actual_amount = ?,
            work_hours = ?, overtime_hours = ?, location = ?
          WHERE id = ?
        `).run(
          employee_name, normal_hours || 0, weekday_overtime || 0, weekend_overtime || 0,
          base_salary || 0, normal_pay || 0, weekday_overtime_pay || 0, weekend_overtime_pay || 0,
          total_payable || 0, deduction || 0, actual_amount || 0,
          (normal_hours || 0) + (weekday_overtime || 0), weekday_overtime || 0,
          location || '车间',
          existingRecord.id
        );
      } else {
        // 创建新记录
        const monthStr = `${yearNumber}-${String(monthNumber).padStart(2, '0')}`;
        query.createWorkHoursMonthly.run(
          employee_id,
          monthStr,
          0, // total_days
          (normal_hours || 0) + (weekday_overtime || 0), // work_hours
          weekday_overtime || 0, // overtime_hours
          weekend_overtime || 0,
          '{}', // details
          employee_name,
          yearNumber,
          monthNumber,
          normal_hours || 0,
          weekday_overtime || 0,
          base_salary || 0,
          normal_pay || 0,
          weekday_overtime_pay || 0,
          weekend_overtime_pay || 0,
          total_payable || 0,
          deduction || 0,
          actual_amount || 0,
          location || '车间'
        );
      }
      
      return NextResponse.json({ success: true, message: '工资记录保存成功' });
    }
    
    // 旧格式：工时数据导入
    const { month, data } = body as { month?: string; data?: WorkHoursImportItem[] };
    
    if (!month || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }
    
    // 先删除该月份的旧数据
    query.deleteWorkHoursMonthlyByMonth.run(month);
    
    // 插入新数据
    for (const item of data) {
      const { employeeId, employeeName, totalDays, workHours, overtimeHours, weekendOvertime, details } = item;
      
      // 如果没有 employeeId，尝试通过姓名查找
      let empId = employeeId;
      if (!empId && employeeName) {
        const employee = query.getEmployeeByNameAndPhone.get(employeeName, '') as EmployeeIdLookup | undefined;
        if (employee) {
          empId = employee.id;
        }
      }
      
      if (empId) {
        query.createWorkHoursMonthlySimple.run(
          empId,
          month,
          totalDays || 0,
          workHours || 0,
          overtimeHours || 0,
          weekendOvertime || 0,
          JSON.stringify(details || {})
        );
      }
    }
    
    return NextResponse.json({ success: true, message: '工时数据导入成功' });
  } catch (error) {
    console.error('Import work hours error:', error);
    return NextResponse.json({ error: '导入工时数据失败' }, { status: 500 });
  }
}
