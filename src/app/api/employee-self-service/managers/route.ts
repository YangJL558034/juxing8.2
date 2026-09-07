import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getCurrentUser } from '@/lib/auth';

function isAdmin(role: string) { return role === 'admin' || role === 'super_admin'; }

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request.headers.get('cookie'));
  if (!user || !isAdmin(user.role)) return NextResponse.json({ success: false, error: '仅管理员可配置' }, { status: 403 });
  const managers = db.prepare(`SELECT m.location, m.user_id, u.name, u.role FROM employee_self_service_managers m JOIN users u ON u.id = m.user_id`).all();
  return NextResponse.json({ success: true, managers });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser(request.headers.get('cookie'));
  if (!user || !isAdmin(user.role)) return NextResponse.json({ success: false, error: '仅管理员可配置' }, { status: 403 });
  const body = await request.json() as { location?: string; userId?: number | null };
  const location = body.location === 'office' || body.location === 'workshop' ? body.location : '';
  if (!location) return NextResponse.json({ success: false, error: '区域参数错误' }, { status: 400 });
  if (body.userId) {
    // 自助平台管理者与系统后台角色解耦：任意已建立登录账号的员工都可被指定。
    const manager = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(body.userId));
    if (!manager) return NextResponse.json({ success: false, error: '所选账号不是管理者' }, { status: 400 });
    db.prepare(`INSERT INTO employee_self_service_managers(location, user_id, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(location) DO UPDATE SET user_id = excluded.user_id, updated_at = CURRENT_TIMESTAMP`).run(location, Number(body.userId));
  } else {
    db.prepare('DELETE FROM employee_self_service_managers WHERE location = ?').run(location);
  }
  return NextResponse.json({ success: true });
}
