import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getCurrentUser } from '@/lib/auth';

function isAdmin(role: string) { return role === 'admin' || role === 'super_admin'; }

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request.headers.get('cookie'));
  if (!user || !isAdmin(user.role)) return NextResponse.json({ success: false, error: '仅管理员可配置' }, { status: 403 });
  const managers = db.prepare(`SELECT m.location, m.employee_id, e.name FROM employee_self_service_managers m JOIN employees e ON e.id = m.employee_id`).all();
  return NextResponse.json({ success: true, managers });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser(request.headers.get('cookie'));
  if (!user || !isAdmin(user.role)) return NextResponse.json({ success: false, error: '仅管理员可配置' }, { status: 403 });
  const body = await request.json() as { location?: string; employeeId?: number | null };
  const location = body.location === 'office' || body.location === 'workshop' ? body.location : '';
  if (!location) return NextResponse.json({ success: false, error: '区域参数错误' }, { status: 400 });
  if (body.employeeId) {
    const manager = db.prepare("SELECT id FROM employees WHERE id = ? AND status <> '离职'").get(Number(body.employeeId));
    if (!manager) return NextResponse.json({ success: false, error: '所选账号不是管理者' }, { status: 400 });
    const linkedUser = db.prepare('SELECT id FROM users WHERE employee_id = ? LIMIT 1').get(Number(body.employeeId)) as { id: number } | undefined;
    db.prepare(`INSERT INTO employee_self_service_managers(location, user_id, employee_id, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(location) DO UPDATE SET user_id = excluded.user_id, employee_id = excluded.employee_id, updated_at = CURRENT_TIMESTAMP`).run(location, linkedUser?.id || 0, Number(body.employeeId));
  } else {
    db.prepare('DELETE FROM employee_self_service_managers WHERE location = ?').run(location);
  }
  return NextResponse.json({ success: true });
}
