import { NextRequest, NextResponse } from 'next/server';
import { db, logOperationServer } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { chinaToday } from '@/lib/china-time';
import { resolveEmployeeSalaryLocation } from '@/lib/employee-location';
import { normalizeAttendanceSchedule } from '@/lib/attendance-missing-punch';

const ATTENDANCE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// 单独保存员工的上下班打卡时间，未设置时使用系统默认时间。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: '登录已过期' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json() as {
      attendanceCheckInTime?: unknown;
      attendanceCheckOutTime?: unknown;
    };
    const attendanceCheckInTime = String(body.attendanceCheckInTime ?? '').trim();
    const attendanceCheckOutTime = String(body.attendanceCheckOutTime ?? '').trim();

    if (!ATTENDANCE_TIME_PATTERN.test(attendanceCheckInTime) || !ATTENDANCE_TIME_PATTERN.test(attendanceCheckOutTime)) {
      return NextResponse.json({ error: '打卡时间格式不正确' }, { status: 400 });
    }

    const schedule = normalizeAttendanceSchedule(attendanceCheckInTime, attendanceCheckOutTime);
    if (schedule.checkInTime !== attendanceCheckInTime || schedule.checkOutTime !== attendanceCheckOutTime) {
      return NextResponse.json({ error: '下班打卡时间必须晚于上班打卡时间' }, { status: 400 });
    }

    const employee = db.prepare('SELECT id, name FROM employees WHERE id = ?').get(id) as {
      id: number;
      name: string;
    } | undefined;
    if (!employee) {
      return NextResponse.json({ error: '员工不存在' }, { status: 404 });
    }

    db.prepare(`
      UPDATE employees
      SET attendance_check_in_time = ?, attendance_check_out_time = ?
      WHERE id = ?
    `).run(schedule.checkInTime, schedule.checkOutTime, id);

    logOperationServer({
      userId: decoded.id,
      userName: decoded.name || decoded.username,
      module: 'employee',
      action: 'update_attendance_schedule',
      details: {
        employeeId: employee.id,
        employeeName: employee.name,
        checkInTime: schedule.checkInTime,
        checkOutTime: schedule.checkOutTime,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    const updatedEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    return NextResponse.json({ success: true, data: updatedEmployee, message: '打卡时间已保存' });
  } catch (error) {
    console.error('Update employee attendance schedule error:', error);
    return NextResponse.json({ error: '保存打卡时间失败' }, { status: 500 });
  }
}

// 更新员工
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: '登录已过期' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, phone, department, id_card, location, status, hire_date, self_service_manager_user_id } = body;
    const employeeLocation = resolveEmployeeSalaryLocation(department, location);

    if (!name || !department) {
      return NextResponse.json({ error: '姓名和部门为必填项' }, { status: 400 });
    }

    // 获取当前员工信息
    const currentEmployee = db.prepare('SELECT status FROM employees WHERE id = ?').get(id) as { status: string } | undefined;
    
    // 判断是否需要记录离职日期
    let resignDate = null;
    if (status === '离职' && currentEmployee?.status !== '离职') {
      // 状态从在职变为离职，记录当前日期
      resignDate = chinaToday(); // YYYY-MM-DD 格式
    } else if (status !== '离职') {
      // 状态不是离职，清空离职日期
      resignDate = null;
    } else {
      // 保持原有离职日期
      const existingResign = db.prepare('SELECT resign_date FROM employees WHERE id = ?').get(id) as { resign_date: string } | undefined;
      resignDate = existingResign?.resign_date || null;
    }

    db.prepare(`
      UPDATE employees 
      SET name = ?, phone = ?, department = ?, id_card = ?, location = ?, status = ?, resign_date = ?, hire_date = ?, self_service_manager_user_id = ?
      WHERE id = ?
    `).run(name, phone || null, department, id_card || null, employeeLocation, status || '在职', resignDate, hire_date || null, self_service_manager_user_id ? Number(self_service_manager_user_id) : null, id);

    // 记录操作日志
    logOperationServer({
      userId: decoded.id,
      userName: decoded.name || decoded.username,
      module: 'employee',
      action: 'update',
      details: { employeeId: id, name, department, status, location: employeeLocation },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    return NextResponse.json({ success: true, message: '员工更新成功' });
  } catch (error) {
    console.error('Update employee error:', error);
    return NextResponse.json({ error: '更新员工失败' }, { status: 500 });
  }
}

// 删除员工
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: '登录已过期' }, { status: 401 });
    }

    const { id } = await params;
    
    // 获取员工信息用于日志
    const employee = db.prepare('SELECT name FROM employees WHERE id = ?').get(id) as { name: string } | undefined;
    
    // 先删除关联的记录（外键约束）
    db.prepare('DELETE FROM employee_work_records WHERE employee_id = ?').run(id);
    db.prepare('DELETE FROM employee_salary_records WHERE employee_id = ?').run(id);
    db.prepare('DELETE FROM work_hours_monthly WHERE employee_id = ?').run(id);
    
    // 再删除员工
    db.prepare('DELETE FROM employees WHERE id = ?').run(id);

    // 记录操作日志
    logOperationServer({
      userId: decoded.id,
      userName: decoded.name || decoded.username,
      module: 'employee',
      action: 'delete',
      details: { employeeId: id, employeeName: employee?.name },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    return NextResponse.json({ success: true, message: '员工删除成功' });
  } catch (error) {
    console.error('Delete employee error:', error);
    return NextResponse.json({ error: '删除员工失败' }, { status: 500 });
  }
}
