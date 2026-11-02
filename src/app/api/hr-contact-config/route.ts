import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { readHrContacts, saveHrContacts } from '@/lib/hr-contact';

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin(request);
  if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
  return NextResponse.json({ success: true, contacts: readHrContacts() });
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const contacts = saveHrContacts((body as Record<string, unknown>)?.contacts);
    return NextResponse.json({ success: true, contacts });
  } catch (error) {
    console.error('Save HR contacts error:', error);
    return NextResponse.json({ success: false, error: '保存失败' }, { status: 500 });
  }
}
