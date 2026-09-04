import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const idCard = String(form.get('idCard') || '').trim();
    const file = form.get('file');
    if (!idCard || !(file instanceof File)) return NextResponse.json({ success: false, error: '头像信息不完整' }, { status: 400 });
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return NextResponse.json({ success: false, error: '头像必须是图片且不超过5MB' }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const avatarUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
    const result = db.prepare("UPDATE employees SET avatar_url = ? WHERE UPPER(REPLACE(id_card, ' ', '')) = UPPER(REPLACE(?, ' ', ''))").run(avatarUrl, idCard);
    if (!result.changes) return NextResponse.json({ success: false, error: '未找到员工档案' }, { status: 404 });
    return NextResponse.json({ success: true, avatarUrl });
  } catch (error) {
    console.error('Employee avatar upload error:', error);
    return NextResponse.json({ success: false, error: '头像上传失败' }, { status: 500 });
  }
}
