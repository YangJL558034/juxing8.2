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
  if (!onboarding) return null;

  const employee = db.prepare(`
    SELECT employee_id, department, position, hire_date, status
    FROM employees
    WHERE id = ? OR (name = ? AND UPPER(REPLACE(id_card, ' ', '')) = ?)
    ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, id DESC
    LIMIT 1
  `).get(
    onboarding.employeeId || -1,
    normalizedName,
    normalizedIdCard,
    onboarding.employeeId || -1,
  ) as { employee_id: string | null; department: string | null; position: string | null; hire_date: string | null; status: string | null } | undefined;

  if (employee?.status?.includes('离职') || onboarding.status === '已离职') return null;
  const hireDate = (employee?.hire_date || onboarding.data.hireDate || '').slice(0, 10);
  return {
    name: onboarding.data.name || onboarding.name,
    idCard: normalizeIdCard(onboarding.data.idCard),
    employeeNo: employee?.employee_id || String(onboarding.employeeId || ''),
    department: employee?.department || onboarding.data.department || onboarding.department,
    position: employee?.position || onboarding.data.position || onboarding.position,
    hireDate,
    contractEndDate: calculateContractEndDate(hireDate, onboarding.data.contractTerm),
  };
}
