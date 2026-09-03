import { NextRequest, NextResponse } from 'next/server';
import { db, query } from '@/lib/database';

interface MessagePayload {
  name?: unknown;
  idCard?: unknown;
  message?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as MessagePayload;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const idCard = typeof body.idCard === 'string' ? body.idCard.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!name || !idCard || !message) {
      return NextResponse.json({ success: false, error: '留言内容不能为空' }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ success: false, error: '留言内容不能超过2000字' }, { status: 400 });
    }

    const employee = query.getEmployeeByNameAndIdCard.get(name, idCard) as { id: number; name: string; status: string } | undefined;
    if (!employee || employee.status === '离职') {
      return NextResponse.json({ success: false, error: '员工身份验证失败' }, { status: 403 });
    }

    const administrators = db.prepare("SELECT id, name FROM users WHERE role IN ('admin', '管理员')").all() as Array<{ id: number; name: string }>;
    const recipients = administrators.length > 0 ? administrators : [{ id: 0, name: '系统管理员' }];
    const insertNotification = db.prepare(`
      INSERT INTO notifications (title, content, sender_id, sender_name, receiver_id, receiver_name, type, email_sent, email_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const administrator of recipients) {
      insertNotification.run(`员工留言：${employee.name}`, message, employee.id, employee.name, administrator.id, administrator.name, '员工留言', 0, null);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存员工留言失败:', error);
    return NextResponse.json({ success: false, error: '留言提交失败' }, { status: 500 });
  }
}
