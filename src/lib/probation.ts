import { db } from '@/lib/database';

/** 试用期统一 1 个月；提前 20 天提醒 HR（仅办公室岗位） */
export const PROBATION_MONTHS = 1;
export const PROBATION_REMIND_DAYS = 20;

let columnReady = false;

/** 员工表增加「是否需要试用期」字段（0 = 直接正式工，不显示/不允许转正申请） */
export function ensureProbationColumn() {
  if (columnReady) return;
  try {
    const columns = db.prepare('PRAGMA table_info(employees)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'probation_required')) {
      db.exec('ALTER TABLE employees ADD COLUMN probation_required INTEGER DEFAULT 1');
    }
    columnReady = true;
  } catch (error) {
    console.error('ensureProbationColumn error:', error);
  }
}

/** 办公室 / 车间判定：优先 location，其次部门名称 */
export function isOfficeEmployee(employee: { location?: string | null; department?: string | null }) {
  const location = String(employee.location || '').trim();
  if (location) return location === '办公室';
  const department = String(employee.department || '');
  return !/生产|车间|产线|流水/.test(department);
}

export function chinaToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addMonths(dateStr: string, months: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from}T00:00:00+08:00`);
  const b = Date.parse(`${to}T00:00:00+08:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function setProbationRequired(employeeId: number, required: boolean) {
  ensureProbationColumn();
  try {
    db.prepare('UPDATE employees SET probation_required = ? WHERE id = ?').run(required ? 1 : 0, employeeId);
    return true;
  } catch (error) {
    console.error('setProbationRequired error:', error);
    return false;
  }
}

export function getProbationRequired(employeeId: number): boolean {
  ensureProbationColumn();
  try {
    const row = db.prepare('SELECT probation_required FROM employees WHERE id = ?').get(employeeId) as
      | { probation_required: number | null }
      | undefined;
    return Number(row?.probation_required ?? 1) !== 0;
  } catch {
    return true;
  }
}
