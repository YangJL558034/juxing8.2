import { NextRequest, NextResponse } from 'next/server';
import { query, db } from '@/lib/database';
import { setEmployeeSession, getEmployeeByRequest, employeeNoticeAccess } from '@/lib/employee-session';

// 身份证脱敏：只保留前 6 位和后 4 位
function maskIdCard(value: string | null | undefined) {
  const text = String(value || '').trim();
  if (text.length < 10) return text ? '****' : '';
  return `${text.slice(0, 6)}********${text.slice(-4)}`;
}
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

interface EmployeeServiceSummary {
  onboarding: {
    id: number;
    status: string;
    createdAt: string;
    confidentialityConfirmed: boolean;
    [key: string]: unknown;
  } | null;
  socialSecurity: Array<{
    id: number;
    documentType: string;
    status: string;
    applicationDate: string | null;
    createdAt: string;
  }>;
  socialSecurityPurchase: Array<{
    id: number;
    status: string;
    insuranceStatus: string | null;
    createdAt: string;
  }>;
  notifications: Array<{
    id: number;
    title: string;
    content: string | null;
    senderName: string | null;
    createdAt: string;
  }>;
  resignationRecords: Array<{ id: number; status: string; createdAt: string; [key: string]: unknown }>;
  regularizationRecords: Array<{ id: number; status: string; createdAt: string; [key: string]: unknown }>;
  workCertificateRecords: Array<{ id: number; status: string; createdAt: string; [key: string]: unknown }>;
}

// 从 data_json 里取少量文本字段（原因/总结等），签名图片等大字段不返回
function pickJsonText(raw: string | null, keys: string[], max = 500): string {
  if (!raw) return '';
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) {
        const text = value.trim();
        return text.length > max ? `${text.slice(0, max)}…` : text;
      }
    }
  } catch {
    // 忽略解析失败
  }
  return '';
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

    // lite=true 表示只返回基础信息（登录后首屏用，减小响应体积）
    const lite = searchParams.get('lite') === 'true';

    // 身份只认登录会话（X-Employee-Token / employee_session），不再接受 URL 里的姓名+身份证
    const session = getEmployeeByRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }

    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(session.id) as {
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

    // lite 模式：只返回员工基本信息，跳过所有大对象查询（工资、考勤、请假等）
    if (lite) {
      const managerAssignment = db.prepare('SELECT location FROM employee_self_service_managers WHERE employee_id = ?').get(employee.id) as { location: string } | undefined;
      // 过滤掉 avatar_url（base64 大图片，100KB+），小程序不需要
      const { avatar_url, ...employeeLite } = employee as typeof employee & { avatar_url?: string };
      // 工资记录：保留最近 24 个月的月度汇总，但剔除体积较大的 details（逐日打卡明细）
      // 小程序工资页依赖 salaryRecords 渲染，返回空数组会导致工资页取不到数据
      const salaryRecords = (db.prepare(`
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
        LIMIT 24
      `).all(employee.id, employee.name) as MonthlyRecordRow[]).map((record) => {
        const summary: Record<string, unknown> = { ...record };
        delete summary.details;
        // signature 是 base64 签名图片（单条可达数百 KB），小程序只判断"是否已签"，
        // 故降级为布尔值，避免 lite 响应体积爆炸
        summary.signature = Boolean(record.signature);
        return summary;
      });
      const response = NextResponse.json({
        success: true,
        employee: { ...employeeLite, id_card: maskIdCard(employee.id_card), wxBound: Boolean((employee as { wx_openid?: string | null }).wx_openid), isSelfServiceManager: Boolean(managerAssignment), selfServiceManagerLocation: managerAssignment?.location },
        salaryRecords,
        attendanceRecords: [],
        leaveRecords: [],
        missingPunchRecords: [],
        serviceSummary: { onboarding: null, socialSecurity: [], socialSecurityPurchase: [], notifications: [], resignationRecords: [], regularizationRecords: [], workCertificateRecords: [] },
      });
      response.headers.set('Cache-Control', 'no-store');
      setEmployeeSession(response, employee.id);
      return response;
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

    const onboardingRow = db.prepare(`
      SELECT id, status, data_json, created_at
      FROM onboarding_records
      WHERE employee_id = ? OR (name = ? AND id_card = ?)
      ORDER BY id DESC
      LIMIT 1
    `).get(employee.id, employee.name, employee.id_card) as {
      id: number;
      status: string;
      data_json: string | null;
      created_at: string;
    } | undefined;

    let confidentialityConfirmed = false;
    if (onboardingRow?.data_json) {
      try {
        const onboardingData = JSON.parse(onboardingRow.data_json) as Record<string, unknown>;
        confidentialityConfirmed = onboardingData.confidentialityAgreementConfirmed === true
          || Boolean(onboardingData.confidentialitySignatureDataUrl);
      } catch {
        // 旧入职数据无法解析时，仅展示记录状态。
      }
    }

    const socialSecurityRows = db.prepare(`
      SELECT id, document_type, status, application_date, created_at
      FROM social_security_records
      WHERE deleted_at IS NULL AND (employee_id = ? OR (name = ? AND id_card = ?))
      ORDER BY id DESC
      LIMIT 10
    `).all(employee.id, employee.name, employee.id_card) as Array<{
      id: number;
      document_type: string;
      status: string;
      application_date: string | null;
      created_at: string;
    }>;

    const socialSecurityPurchaseRows = db.prepare(`
      SELECT id, contract_status, insurance_status, created_at
      FROM social_security_purchase_records
      WHERE deleted_at IS NULL AND (employee_id = ? OR (employee_name = ? AND id_card = ?))
      ORDER BY id DESC
      LIMIT 10
    `).all(employee.id, employee.name, employee.id_card) as Array<{
      id: number;
      contract_status: string | null;
      insurance_status: string | null;
      created_at: string;
    }>;

    const resignationRows = db.prepare(`
      SELECT id, status, name, department, position, hire_date, apply_date, resignation_date,
             handover_date, resignation_type, reviewer_name, reviewed_at, created_at, data_json
      FROM resignation_records
      WHERE deleted_at IS NULL AND (employee_id = ? OR (name = ? AND id_card = ?))
      ORDER BY id DESC
    `).all(employee.id, employee.name, employee.id_card) as Array<{
      id: number; status: string; name: string | null; department: string | null; position: string | null;
      hire_date: string | null; apply_date: string | null; resignation_date: string | null;
      handover_date: string | null; resignation_type: string | null; reviewer_name: string | null;
      reviewed_at: string | null; created_at: string; data_json: string | null;
    }>;
    const regularizationRows = db.prepare(`
      SELECT id, status, applicant_name, department, position, hire_date, regularization_date,
             created_at, data_json
      FROM regularization_records
      WHERE deleted_at IS NULL AND (employee_id = ? OR applicant_name = ?)
      ORDER BY id DESC
    `).all(employee.id, employee.name) as Array<{
      id: number; status: string; applicant_name: string | null; department: string | null;
      position: string | null; hire_date: string | null; regularization_date: string | null;
      created_at: string; data_json: string | null;
    }>;
    const workCertificateRows = db.prepare(`
      SELECT id, status, name, department, position, hire_date, purpose, reviewer_name,
             reviewed_at, created_at, data_json
      FROM work_certificate_records
      WHERE deleted_at IS NULL AND (employee_id = ? OR (name = ? AND id_card = ?))
      ORDER BY id DESC
    `).all(employee.id, employee.name, employee.id_card) as Array<{
      id: number; status: string; name: string | null; department: string | null; position: string | null;
      hire_date: string | null; purpose: string | null; reviewer_name: string | null;
      reviewed_at: string | null; created_at: string; data_json: string | null;
    }>;
    const notificationRows = db.prepare(`
      SELECT n.*, CASE WHEN EXISTS (SELECT 1 FROM employee_notification_reads r
        WHERE r.employee_id = @employeeId AND r.notification_id = n.id) THEN 1
        WHEN n.receiver_name NOT IN ('全体员工', '所有员工') THEN n.is_read ELSE 0 END AS is_read
      FROM notifications n
      WHERE ${employeeNoticeAccess}
      ORDER BY n.id DESC
      LIMIT 20
    `).all({ employeeId: employee.id, employeeName: employee.name }) as Array<{
      id: number;
      title: string;
      content: string | null;
      sender_name: string | null;
      attachment_file: string | null;
      attachment_file_name: string | null;
      is_read: number;
      created_at: string;
    }>;

    const serviceSummary: EmployeeServiceSummary = {
      onboarding: onboardingRow ? {
        id: onboardingRow.id,
        status: onboardingRow.status,
        createdAt: onboardingRow.created_at,
        confidentialityConfirmed,
        name: pickJsonText(onboardingRow.data_json, ['name']),
        gender: pickJsonText(onboardingRow.data_json, ['gender']),
        phone: pickJsonText(onboardingRow.data_json, ['phone']),
        department: pickJsonText(onboardingRow.data_json, ['department']),
        position: pickJsonText(onboardingRow.data_json, ['position']),
        hireDate: pickJsonText(onboardingRow.data_json, ['hireDate']),
        recruitmentSource: pickJsonText(onboardingRow.data_json, ['recruitmentSource']),
      } : null,
      socialSecurity: socialSecurityRows.map((row) => ({
        id: row.id,
        documentType: row.document_type,
        status: row.status,
        applicationDate: row.application_date,
        createdAt: row.created_at,
      })),
      socialSecurityPurchase: socialSecurityPurchaseRows.map((row) => ({
        id: row.id,
        status: row.contract_status || '已提交',
        insuranceStatus: row.insurance_status,
        createdAt: row.created_at,
      })),
      resignationRecords: resignationRows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        department: row.department || '',
        position: row.position || '',
        hireDate: row.hire_date || '',
        applyDate: row.apply_date || '',
        resignationDate: row.resignation_date || '',
        handoverDate: row.handover_date || '',
        resignationType: row.resignation_type || '',
        reason: pickJsonText(row.data_json, ['resignationReason', 'reason']),
        reviewerName: row.reviewer_name || '',
        reviewedAt: row.reviewed_at || '',
      })),
      regularizationRecords: regularizationRows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        department: row.department || '',
        position: row.position || '',
        hireDate: row.hire_date || '',
        regularizationDate: row.regularization_date || '',
        workSummary: pickJsonText(row.data_json, ['workSummary', 'summary']),
      })),
      workCertificateRecords: workCertificateRows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        department: row.department || '',
        position: row.position || '',
        hireDate: row.hire_date || '',
        purpose: row.purpose || '',
        reviewerName: row.reviewer_name || '',
        reviewedAt: row.reviewed_at || '',
      })),
      notifications: notificationRows.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        senderName: row.sender_name,
        attachmentFile: row.attachment_file,
        attachmentFileName: row.attachment_file_name,
        isRead: row.is_read === 1,
        createdAt: row.created_at,
      })),
    };

    // 用员工表的部门信息覆盖工资记录的部门信息（工资表部门可能为空）
    const salaryRecordsWithDept = monthlyRecords.map((record) => ({
      ...record,
      department: employee.department || record.department || ''
    }));

    const managerAssignment = db.prepare('SELECT location FROM employee_self_service_managers WHERE employee_id = ?').get(employee.id) as { location: string } | undefined;
    const response = NextResponse.json({
      success: true, 
      employee: { ...employee, id_card: maskIdCard(employee.id_card), wxBound: Boolean((employee as { wx_openid?: string | null }).wx_openid), isSelfServiceManager: Boolean(managerAssignment), selfServiceManagerLocation: managerAssignment?.location },
      workRecords: [],
      salaryRecords: salaryRecordsWithDept,
      monthlyRecords: salaryRecordsWithDept,
      attendanceRecords: attendanceRecords,
      leaveRecords,
      missingPunchRecords,
      serviceSummary,
    });
    response.headers.set('Cache-Control', 'no-store');
    setEmployeeSession(response, employee.id);
    return response;
  } catch (error) {
    console.error('Query employee error:', error);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
