import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { getEmployeeByRequest } from '@/lib/employee-session';
import { chinaToday } from '@/lib/china-time';

const CONTRACT_DAYS = 22;

interface EmployeeRow {
  id: number;
  name: string;
  id_card: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  location: string | null;
  status: string | null;
}

interface PurchaseRow {
  id: number;
  category: string | null;
  contract_status: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_term_years: string | null;
  contract_signed_at: string | null;
  contract_reminder_sent_at: string | null;
}

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

function isSignedStatus(value: string | null | undefined) {
  const text = String(value || '');
  return text.includes('已签') || text.includes('正常');
}

// 老数据里有 2026/08/01 这种斜杠格式，统一成 2026-08-01 再比较
function toDate(value: string | null | undefined) {
  return String(value || '').trim().replace(/\//g, '-');
}

function daysBetween(start: string, end: string) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

interface RenewalRow {
  id: number;
  status: string;
  old_start_date: string | null;
  old_end_date: string | null;
  new_start_date: string | null;
  new_end_date: string | null;
  term_years: string | null;
  applied_by: string | null;
  applied_at: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  remark: string | null;
}

function chinaNowMinute() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

function findLatestRenewal(employeeId: number) {
  return db.prepare(`
    SELECT id, status, old_start_date, old_end_date, new_start_date, new_end_date,
           term_years, applied_by, applied_at, reviewer_name, reviewed_at, remark
    FROM labor_contract_renewals
    WHERE employee_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(employeeId) as RenewalRow | undefined;
}

function buildContractView(employee: EmployeeRow, purchase: PurchaseRow | undefined) {
  const renewal = findLatestRenewal(employee.id);
  const pendingRenewal = Boolean(renewal && renewal.status === '待审核');
  const hireDate = employee.hire_date || '';
  const today = chinaToday();
  const daysSinceHire = hireDate ? Math.max(0, daysBetween(hireDate, today)) : 0;
  const contractStatus = purchase?.contract_status || '';
  const signed = isSignedStatus(contractStatus);
  const daysLeft = hireDate ? CONTRACT_DAYS - daysSinceHire : null;
  const contractEndDate = purchase?.contract_end_date || '';
  // 已签订且合同还没到期 → 不允许再提交，到期后才能续签
  const expired = Boolean(signed && toDate(contractEndDate) && toDate(contractEndDate) < today);
  const canEdit = (!signed || expired) && !pendingRenewal;
  return {
    employeeId: employee.id,
    name: employee.name,
    idCard: employee.id_card || '',
    department: employee.department || '',
    position: employee.position || '',
    category: resolveCategory(employee),
    hireDate,
    daysSinceHire: hireDate ? daysSinceHire : null,
    daysLeft,
    overdue: Boolean(hireDate) && !signed && daysLeft !== null && daysLeft < 0,
    signed,
    expired,
    canEdit,
    pendingRenewal,
    contractStatus,
    contractStartDate: purchase?.contract_start_date || '',
    contractEndDate,
    contractTermYears: purchase?.contract_term_years || '',
    signedAt: purchase?.contract_signed_at || '',
    reminderSentAt: purchase?.contract_reminder_sent_at || '',
    purchaseId: purchase?.id || null,
    // 到期时间精确到分钟：合同结束当天 23:59
    expireAt: contractEndDate ? `${toDate(contractEndDate)} 23:59` : '',
    renewal: renewal ? {
      id: renewal.id,
      status: renewal.status,
      oldStartDate: renewal.old_start_date || '',
      oldEndDate: renewal.old_end_date || '',
      newStartDate: renewal.new_start_date || '',
      newEndDate: renewal.new_end_date || '',
      termYears: renewal.term_years || '',
      appliedBy: renewal.applied_by || '',
      appliedAt: renewal.applied_at,
      reviewerName: renewal.reviewer_name || '',
      reviewedAt: renewal.reviewed_at || '',
      remark: renewal.remark || '',
    } : null,
  };
}

function findPurchase(employee: EmployeeRow, category?: string) {
  const row = db.prepare(`
    SELECT id, category, contract_status, contract_start_date, contract_end_date,
           contract_term_years, contract_signed_at, contract_reminder_sent_at
    FROM social_security_purchase_records
    WHERE deleted_at IS NULL
      AND (employee_id = ? OR (id_card IS NOT NULL AND id_card <> '' AND id_card = ?))
    ORDER BY id DESC LIMIT 1
  `).get(employee.id, employee.id_card || '') as PurchaseRow | undefined;
  if (row) return row;
  if (!category) return undefined;
  return undefined;
}

function resolveCategory(employee: EmployeeRow) {
  const location = String(employee.location || '');
  if (location.includes('办公室')) return 'management';
  if (location.includes('车间')) return 'production';
  return /生产|车间|产线|流水/.test(String(employee.department || '')) ? 'production' : 'management';
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const { searchParams } = new URL(request.url);

    if (user) {
      // 已被「解除劳动合同」登记过的员工，不再出现在劳动合同管理里
      const employees = db.prepare(`
        SELECT id, name, id_card, department, position, hire_date, location, status
        FROM employees e
        WHERE e.status = '在职'
          AND NOT EXISTS (
            SELECT 1 FROM labor_contract_termination_records t
            WHERE t.deleted_at IS NULL AND t.employee_name = e.name
          )
        ORDER BY hire_date DESC, id DESC
      `).all() as EmployeeRow[];
      return NextResponse.json({
        success: true,
        contractDays: CONTRACT_DAYS,
        records: employees.map((employee) => buildContractView(employee, findPurchase(employee))),
      });
    }

    // 员工端：只认登录会话（Token / Cookie）
    const session = getEmployeeByRequest(request);

    let employee: EmployeeRow | undefined;
    if (session) {
      employee = db.prepare(`
        SELECT id, name, id_card, department, position, hire_date, location, status
        FROM employees WHERE id = ?
      `).get(session.id) as EmployeeRow | undefined;
    }
    if (!employee) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }
    return NextResponse.json({
      success: true,
      contractDays: CONTRACT_DAYS,
      record: buildContractView(employee, findPurchase(employee)),
    });
  } catch (error) {
    console.error('Get labor contract error:', error);
    return NextResponse.json({ success: false, error: '获取劳动合同信息失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const raw = ((body as Record<string, unknown>)?.data || body) as Record<string, unknown>;

    const inputStatus = String(raw?.status || raw?.contractStatus || '').trim();
    const inputStart = String(raw?.startDate || raw?.contractStartDate || '').trim();
    const inputEnd = String(raw?.endDate || raw?.contractEndDate || '').trim();
    const inputTerm = String(raw?.termYears || raw?.contractTermYears || '').trim();
    const inputSignedAt = String(raw?.signedAt || '').trim() || chinaToday();
    const inputName = String(raw?.name || '').trim();
    const inputIdCard = String(raw?.idCard || '').trim().toUpperCase();

    if (!['已签订', '未签订'].includes(inputStatus)) {
      return NextResponse.json({ success: false, error: '请选择合同状态' }, { status: 400 });
    }
    if (inputStatus === '已签订') {
      if (!inputStart) return NextResponse.json({ success: false, error: '请填写合同开始日期' }, { status: 400 });
      if (!inputEnd) return NextResponse.json({ success: false, error: '请填写合同结束日期' }, { status: 400 });
      if (inputEnd < inputStart) return NextResponse.json({ success: false, error: '合同结束日期不能早于开始日期' }, { status: 400 });
    }

    // 身份：管理员可代填任意员工；员工只能填自己（必须登录）
    const adminUser = await requireUser(request);
    const session = adminUser ? null : getEmployeeByRequest(request);
    if (!adminUser && !session) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }

    let employee: EmployeeRow | undefined;
    if (adminUser) {
      if (!inputName || !inputIdCard) {
        return NextResponse.json({ success: false, error: '请提供员工姓名和身份证号' }, { status: 400 });
      }
      employee = db.prepare(`
        SELECT id, name, id_card, department, position, hire_date, location, status
        FROM employees WHERE name = ? AND id_card = ?
      `).get(inputName, inputIdCard) as EmployeeRow | undefined;
    } else {
      employee = db.prepare(`
        SELECT id, name, id_card, department, position, hire_date, location, status
        FROM employees WHERE id = ?
      `).get((session as { id: number }).id) as EmployeeRow | undefined;
    }

    if (!employee) {
      return NextResponse.json({ success: false, error: '员工身份验证失败' }, { status: 403 });
    }

    const existing = findPurchase(employee);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 已签订且合同未到期 → 不允许重复提交；已到期 → 走续签审批
    if (existing && isSignedStatus(existing.contract_status)) {
      const contractEnd = toDate(existing.contract_end_date);
      const expired = Boolean(contractEnd && contractEnd < chinaToday());
      if (!expired) {
        return NextResponse.json({
          success: false,
          error: contractEnd
            ? `劳动合同已签订（${contractEnd} 到期），到期后才能再次提交续签`
            : '劳动合同已签订，到期后才能再次提交续签',
        }, { status: 400 });
      }

      const pending = db.prepare(`
        SELECT id FROM labor_contract_renewals WHERE employee_id = ? AND status = '待审核' LIMIT 1
      `).get(employee.id) as { id: number } | undefined;
      if (pending) {
        return NextResponse.json({ success: false, error: '已有待审核的续签申请，请等待管理员审核' }, { status: 400 });
      }

      const insert = db.prepare(`
        INSERT INTO labor_contract_renewals (
          employee_id, employee_name, id_card, department, category, status,
          old_start_date, old_end_date, new_start_date, new_end_date, term_years,
          applied_by, applied_at
        ) VALUES (?, ?, ?, ?, ?, '待审核', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        employee.id,
        employee.name,
        employee.id_card || '',
        employee.department || '',
        resolveCategory(employee),
        existing.contract_start_date || '',
        existing.contract_end_date || '',
        inputStart,
        inputEnd,
        inputTerm,
        employee.name,
        chinaNowMinute(),
      );

      return NextResponse.json({
        success: true,
        pending: true,
        id: Number(insert.lastInsertRowid),
        message: '续签申请已提交，等待管理员审核',
      });
    }

    if (existing) {
      db.prepare(`
        UPDATE social_security_purchase_records
        SET contract_status = ?,
            contract_start_date = ?,
            contract_end_date = ?,
            contract_term_years = ?,
            contract_signed_at = ?,
            contract_reminder_sent_at = NULL,
            updated_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).run(inputStatus, inputStart, inputEnd, inputTerm, inputSignedAt, existing.id);
      return NextResponse.json({ success: true, id: existing.id, message: '劳动合同已登记' });
    }

    const result = db.prepare(`
      INSERT INTO social_security_purchase_records (
        category, department, employee_name, id_card, phone, contract_status,
        contract_start_date, contract_end_date, contract_term_years, contract_signed_at,
        employment_status, employee_id, data_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '在职', ?, ?, datetime('now', '+8 hours'))
    `).run(
      resolveCategory(employee),
      employee.department || '',
      employee.name,
      employee.id_card || '',
      '',
      inputStatus,
      inputStart,
      inputEnd,
      inputTerm,
      inputSignedAt,
      employee.id,
      JSON.stringify({
        category: resolveCategory(employee),
        employeeName: employee.name,
        idCard: employee.id_card || '',
        department: employee.department || '',
        contractStatus: inputStatus,
        contractStartDate: inputStart,
        contractEndDate: inputEnd,
        contractTermYears: inputTerm,
      }),
    );

    return NextResponse.json({ success: true, id: Number(result.lastInsertRowid), message: '劳动合同已登记' });
  } catch (error) {
    console.error('Save labor contract error:', error);
    return NextResponse.json({ success: false, error: '保存劳动合同失败' }, { status: 500 });
  }
}
