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
  if (user.role !== 'manager' && user.role !== 'dept_manager') return false;
  if (department && user.department && department === user.department) return true;
  if (employeeId) {
    const subordinate = db.prepare('SELECT 1 FROM employees WHERE id = ? AND manager_id = ?').get(employeeId, user.id);
    if (subordinate) return true;
  }
  return false;
}
