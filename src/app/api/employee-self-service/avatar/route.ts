import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeSession } from '@/lib/employee-session';

export async function POST(request: NextRequest) {
  try {
    const employee = getEmployeeSession(request);
    if (!employee) return NextResponse.json({ success: false, error: '请重新登录员工平台' }, { status: 401 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: '头像信息不完整' }, { status: 400 });
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) return NextResponse.json({ success: false, error: '请上传不超过5MB的 JPG、PNG、WebP 或 GIF 图片' }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const avatarUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
    const migrating = form.get('migration') === 'true';
    const result = db.prepare(`UPDATE employees SET avatar_url = ? WHERE id = ? ${migrating ? "AND COALESCE(avatar_url, '') = ''" : ''}`).run(avatarUrl, employee.id);
    if (migrating && !result.changes) {
      const saved = db.prepare('SELECT avatar_url FROM employees WHERE id = ?').get(employee.id) as { avatar_url: string };
      return NextResponse.json({ success: true, avatarUrl: saved.avatar_url });
    }
    if (!result.changes) return NextResponse.json({ success: false, error: '未找到员工档案' }, { status: 404 });
    return NextResponse.json({ success: true, avatarUrl });
  } catch (error) {
    console.error('Employee avatar upload error:', error);
    return NextResponse.json({ success: false, error: '头像上传失败' }, { status: 500 });
  }
}
