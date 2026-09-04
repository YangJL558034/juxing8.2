import { db } from '@/lib/database';
import { normalizeIdCard } from '@/lib/identity-validation';
import { parseOnboardingRow, type OnboardingDbRow } from '@/lib/onboarding-records';

export interface ResignationEmployeeProfile {
  name: string;
  idCard: string;
  employeeNo: string;
  department: string;
  position: string;
  hireDate: string;
  contractEndDate: string;
}

function calculateContractEndDate(hireDate: string, contractTerm: string): string {
  const years = Number.parseFloat(contractTerm);
  if (!hireDate || !Number.isFinite(years) || years <= 0) return '';
  const start = new Date(`${hireDate.slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime())) return '';
  start.setFullYear(start.getFullYear() + years);
  start.setDate(start.getDate() - 1);
  return start.toISOString().slice(0, 10);
}

export function findResignationEmployee(name: string, idCard: string): ResignationEmployeeProfile | null {
  const normalizedName = name.trim();
  const normalizedIdCard = normalizeIdCard(idCard);
  if (!normalizedName || !normalizedIdCard) return null;

  const rows = db.prepare(`
    SELECT * FROM onboarding_records
    WHERE name = ? AND status = '已审核'
    ORDER BY reviewed_at DESC, id DESC
  `).all(normalizedName) as OnboardingDbRow[];
  const onboarding = rows
    .map(parseOnboardingRow)
    .find((record) => normalizeIdCard(record.data.idCard) === normalizedIdCard);
  // 兼容系统上线前已入职的老员工：没有入职登记记录时，直接使用员工档案自动带出资料。
  if (!onboarding) {
    const legacy = db.prepare(`
      SELECT id, name, id_card, employee_id, department, position, hire_date, status
      FROM employees
      WHERE name = ? AND UPPER(REPLACE(id_card, ' ', '')) = ?
      LIMIT 1
    `).get(normalizedName, normalizedIdCard) as { id: number; name: string; id_card: string; employee_id: string | null; department: string | null; position: string | null; hire_date: string | null; status: string | null } | undefined;
    if (!legacy || legacy.status?.includes('离职')) return null;
    return { name: legacy.name, idCard: normalizeIdCard(legacy.id_card), employeeNo: legacy.employee_id || String(legacy.id), department: legacy.department || '', position: legacy.position || '', hireDate: (legacy.hire_date || '').slice(0, 10), contractEndDate: '' };
  }

  const employee = db.prepare(`
    SELECT id, employee_id, department, position, hire_date, status
    FROM employees
    WHERE id = ? OR (name = ? AND UPPER(REPLACE(id_card, ' ', '')) = ?)
    ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, id DESC
    LIMIT 1
  `).get(
    onboarding.employeeId || -1,
    normalizedName,
    normalizedIdCard,
    onboarding.employeeId || -1,
  ) as { id: number; employee_id: string | null; department: string | null; position: string | null; hire_date: string | null; status: string | null } | undefined;

  const legacyProfile = db.prepare(`
    SELECT id, employee_id, department, position, hire_date, status
    FROM employees
    WHERE name = ? AND UPPER(REPLACE(id_card, ' ', '')) = ?
    LIMIT 1
  `).get(normalizedName, normalizedIdCard) as typeof employee;
  const profile = employee || legacyProfile;

  if (profile?.status?.includes('离职') || onboarding.status === '已离职') return null;
  const hireDate = (profile?.hire_date || onboarding.data.hireDate || '').slice(0, 10);
  return {
    name: onboarding.data.name || onboarding.name,
    idCard: normalizeIdCard(onboarding.data.idCard),
    employeeNo: profile?.employee_id || (profile?.id ? String(profile.id) : String(onboarding.employeeId || '')),
    department: profile?.department || onboarding.data.department || onboarding.department,
    position: profile?.position || onboarding.data.position || onboarding.position,
    hireDate,
    contractEndDate: calculateContractEndDate(hireDate, onboarding.data.contractTerm),
  };
}
