import type { User } from '@/lib/auth';
import { db } from '@/lib/database';

const managerPermissions = new Set([
  'dashboard',
  'organization',
  'users',
  'approvals',
  'expense_claims',
  'purchase_requests',
]);

export function hasPermission(user: User | null | undefined, permission: string) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  if (user.role === 'manager' && managerPermissions.has(permission)) return true;

  const row = db.prepare(`
    SELECT up.granted AS granted
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ? AND p.code = ?
  `).get(user.id, permission) as { granted: number | null } | undefined;

  return row?.granted === 1;
}

export function hasAnyPermission(user: User | null | undefined, permissions: string[]) {
  return permissions.some((permission) => hasPermission(user, permission));
}

/** 人事申请分级审核：管理员可终审，部门经理只可审核本部门/直属下属。 */
export function canReviewPersonnel(user: User | null | undefined, department?: string | null, employeeId?: number | null) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  const assignedLocation = employeeId
    ? (db.prepare('SELECT location FROM employees WHERE id = ?').get(employeeId) as { location?: string } | undefined)?.location
    : department
      ? (db.prepare('SELECT location FROM employees WHERE department = ? LIMIT 1').get(department) as { location?: string } | undefined)?.location
      : undefined;
  if (assignedLocation && db.prepare('SELECT 1 FROM employee_self_service_managers WHERE location = ? AND user_id = ?').get(assignedLocation, user.id)) return true;
  if (user.role !== 'manager' && user.role !== 'dept_manager') return false;
  if (department && user.department && department === user.department) return true;
  if (department && user.department) {
    const sameDepartment = db.prepare(`
      SELECT 1 FROM departments d
      WHERE d.name = ? AND (CAST(d.id AS TEXT) = ? OR d.name = ?)
    `).get(department, user.department, user.department);
    if (sameDepartment) return true;
  }
  if (employeeId) {
    const locationRow = db.prepare('SELECT location FROM employees WHERE id = ?').get(employeeId) as { location?: string } | undefined;
    if (locationRow?.location) {
      const assigned = db.prepare('SELECT 1 FROM employee_self_service_managers WHERE location = ? AND user_id = ?').get(locationRow.location, user.id);
      if (assigned) return true;
    }
    const subordinate = db.prepare(`
      SELECT 1 FROM employees e
      LEFT JOIN departments d ON CAST(d.id AS TEXT) = e.department
      WHERE e.id = ? AND (e.manager_id = ? OR e.self_service_manager_user_id = ? OR e.department = ? OR d.name = ?)
    `).get(employeeId, user.id, user.id, user.department || '', user.department || '');
    if (subordinate) return true;
  }
  if (department) {
    const location = db.prepare('SELECT location FROM employees WHERE department = ? LIMIT 1').get(department) as { location?: string } | undefined;
    if (location?.location) {
      const assigned = db.prepare('SELECT 1 FROM employee_self_service_managers WHERE location = ? AND user_id = ?').get(location.location, user.id);
      if (assigned) return true;
    }
  }
  return false;
}
