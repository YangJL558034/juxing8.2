import { NextResponse } from 'next/server';
import { createCaptcha } from '@/lib/captcha';

export async function GET() {
  const captcha = createCaptcha();
  return NextResponse.json({ success: true, ...captcha }, { headers: { 'Cache-Control': 'no-store' } });
}
