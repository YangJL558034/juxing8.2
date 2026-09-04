import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { id?: number; employeeName?: string };
    if (!body.id || !body.employeeName) return NextResponse.json({ success: false }, { status: 400 });
    db.prepare('UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ? AND receiver_name = ?').run(body.id, body.employeeName);
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ success: false }, { status: 500 }); }
}
