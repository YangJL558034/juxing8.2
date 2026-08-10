import { NextRequest, NextResponse } from 'next/server';
import { query, db } from '@/lib/database';
import {
  isDateInLeaveRange,
  parseLeaveRequestRow,
  type LeaveRequestDbRow,
} from '@/lib/leave-records';
import { chinaNowSql, chinaToday } from '@/lib/china-time';
import {
  createMissingPunchReminder,
  extractAttendanceTimes,
  getMissingPunchPeriods,
  isExpectedAttendanceDate,
  type MissingPunchReminder,
} from '@/lib/attendance-missing-punch';

interface MonthlyRecordRow {
  [key: string]: unknown;
  id: number;
  employee_id: number;
  employee_name?: string | null;
  department?: string | null;
  details?: string | null;
  year: number;
  month_num: number;
}

interface AttendanceRecord {
  employee_id: number;
  employee_name: string;
  date: string;
  time: string;
  year: number;
  month: number;
}

function buildMissingPunchReminders(
  monthlyRecords: MonthlyRecordRow[],
  leaveRecords: ReturnType<typeof parseLeaveRequestRow>[],
  hireDate?: string | null,
  checkInTime?: string | null,
  checkOutTime?: string | null,
): MissingPunchReminder[] {
  const today = chinaToday();
  const currentTime = chinaNowSql().slice(11, 16);
  const monthKeys = new Set<string>();
  const timesByDate = new Map<string, string[]>();

  monthlyRecords.forEach((record) => {
    const monthKey = `${record.year}-${String(record.month_num).padStart(2, '0')}`;
    monthKeys.add(monthKey);
    if (!record.details) return;

    try {
      const details = JSON.parse(record.details) as Record<string, unknown>;
      Object.entries(details).forEach(([day, value]) => {
        const dayNumber = Number(day);
        if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return;
        const date = `${monthKey}-${String(dayNumber).padStart(2, '0')}`;
        const merged = [...(timesByDate.get(date) || []), ...extractAttendanceTimes(value)];
        timesByDate.set(date, [...new Set(merged)]);
      });
    } catch {
      // 无法解析的旧数据不参与缺卡判断。
    }
  });

  const reminders: MissingPunchReminder[] = [];
  Array.from(monthKeys).forEach((monthKey) => {
    if (monthKey > today.slice(0, 7)) return;
    const [year, month] = monthKey.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastDay = monthKey === today.slice(0, 7) ? Number(today.slice(8, 10)) : daysInMonth;

    for (let day = 1; day <= lastDay; day += 1) {
      const date = `${monthKey}-${String(day).padStart(2, '0')}`;
      if (!isExpectedAttendanceDate(date, hireDate)) continue;
      const leaves = leaveRecords.filter((leave) => isDateInLeaveRange(leave, date));
      const missingPeriods = getMissingPunchPeriods({
        date,
        times: timesByDate.get(date) || [],
        leaves,
        today,
        currentTime,
        checkInTime,
        checkOutTime,
      });
      if (missingPeriods.length > 0) {
        reminders.push(createMissingPunchReminder(date, missingPeriods, checkInTime, checkOutTime));
      }
    }
  });

  return reminders.sort((a, b) => b.date.localeCompare(a.date));
}

// 员工查询（免登录，通过姓名+身份证验证）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const idCard = searchParams.get('idCard');

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: '请输入姓名' });
    }

    if (!idCard || !idCard.trim()) {
      return NextResponse.json({ success: false, error: '请输入身份证号' });
    }

    // 必须通过姓名+身份证精确匹配
    const employee = query.getEmployeeByNameAndIdCard.get(name.trim(), idCard.trim()) as {
      id: number;
      name: string;
      id_card: string;
      phone: string;
      department: string;
      position: string;
      base_salary: number;
      status: string;
      location?: string;
      hire_date?: string | null;
      attendance_check_in_time?: string | null;
      attendance_check_out_time?: string | null;
    } | undefined;

    if (!employee) {
      return NextResponse.json({ 
        success: false, 
        error: '员工信息验证失败，请确认姓名和身份证号是否正确' 
      });
    }

    // 检查员工是否已离职
    if (employee.status === '离职') {
      return NextResponse.json({ 
        success: false, 
        error: '该员工已离职，无法查询' 
      });
    }

    // 获取工时记录（月度汇总）- 作为工资记录返回。
    // 历史导入数据可能保留了旧 employee_id，若旧 ID 已无对应员工，则按姓名回退匹配。
    const monthlyRecords = db.prepare(`
      SELECT w.*
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
    `).all(employee.id, employee.name) as MonthlyRecordRow[];
    
    // 从 work_hours_monthly.details 解析打卡记录
    const attendanceRecords: AttendanceRecord[] = [];
    for (const record of monthlyRecords) {
      if (record.details) {
        try {
          const details = JSON.parse(record.details) as Record<string, unknown>;
          const year = record.year;
          const month = record.month_num;
          
          // details 格式: { "1": "08:00\n12:02\n13:22", "2": "07:57\n12:02" }
          for (const [day, times] of Object.entries(details)) {
            const timeList = String(times).split('\n').filter(t => t.trim());
            for (const time of timeList) {
              attendanceRecords.push({
                employee_id: employee.id,
                employee_name: employee.name,
                date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                time: time.trim(),
                year,
                month
              });
            }
          }
        } catch {
          // 解析失败，跳过
        }
      }
    }
    
    // 按日期和时间排序
    attendanceRecords.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });

    const leaveRows = db.prepare(`
      SELECT *
      FROM leave_request_records
      WHERE deleted_at IS NULL
        AND status = '已审核'
        AND (
          employee_id = ?
          OR id_card = ?
          OR (
            employee_name = ?
            AND (department = '' OR department = ?)
          )
        )
      ORDER BY leave_date DESC, created_at DESC, id DESC
    `).all(employee.id, employee.id_card || '', employee.name, employee.department || '') as LeaveRequestDbRow[];

    const leaveRecords = leaveRows.map(parseLeaveRequestRow);
    const missingPunchRecords = buildMissingPunchReminders(
      monthlyRecords,
      leaveRecords,
      employee.hire_date,
      employee.attendance_check_in_time,
      employee.attendance_check_out_time,
    );

    // 用员工表的部门信息覆盖工资记录的部门信息（工资表部门可能为空）
    const salaryRecordsWithDept = monthlyRecords.map((record) => ({
      ...record,
      department: employee.department || record.department || ''
    }));

    return NextResponse.json({ 
      success: true, 
      employee,
      workRecords: [],
      salaryRecords: salaryRecordsWithDept,
      monthlyRecords: salaryRecordsWithDept,
      attendanceRecords: attendanceRecords,
      leaveRecords,
      missingPunchRecords,
    });
  } catch (error) {
    console.error('Query employee error:', error);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
