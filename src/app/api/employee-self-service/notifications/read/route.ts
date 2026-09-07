import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeSession, employeeNoticeAccess } from '@/lib/employee-session';

export async function POST(request: NextRequest) {
  try {
    const employee = getEmployeeSession(request);
    if (!employee) return NextResponse.json({ success: false }, { status: 401 });
    const body = await request.json() as { id?: number };
    if (!Number.isSafeInteger(body.id) || Number(body.id) <= 0) return NextResponse.json({ success: false }, { status: 400 });
    const notice = db.prepare(`SELECT n.id FROM notifications n WHERE n.id = @id AND ${employeeNoticeAccess}`)
      .get({ id: body.id, employeeId: employee.id, employeeName: employee.name });
    if (!notice) return NextResponse.json({ success: false }, { status: 404 });
    db.prepare('INSERT OR IGNORE INTO employee_notification_reads (employee_id, notification_id) VALUES (?, ?)').run(employee.id, body.id);
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ success: false }, { status: 500 }); }
}
