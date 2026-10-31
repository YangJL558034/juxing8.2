import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { normalizeWorkCertificateData, parseWorkCertificateRow, type WorkCertificateDbRow } from '@/lib/work-certificate-records';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim();
    const keyword = searchParams.get('keyword')?.trim();
    const deleted = searchParams.get('deleted') === '1';
    const where: string[] = [];
    const params: unknown[] = [];

    db.prepare("DELETE FROM work_certificate_records WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '+8 hours', '-7 days')").run();

    if (deleted) {
      where.push("deleted_at IS NOT NULL AND deleted_at >= datetime('now', '+8 hours', '-7 days')");
    } else {
      where.push('deleted_at IS NULL');
    }
    if (status && status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }
    if (keyword) {
      where.push('(name LIKE ? OR id_card LIKE ? OR phone LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const rows = db.prepare(`
      SELECT * FROM work_certificate_records
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC
    `).all(...params) as WorkCertificateDbRow[];

    return NextResponse.json({ success: true, records: rows.map(parseWorkCertificateRow) });
  } catch (error) {
    console.error('Get work certificate records error:', error);
    return NextResponse.json({ success: false, error: '获取工作证明申请失败' }, { status: 500 });
  }
}

import { getEmployeeByRequest } from '@/lib/employee-session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = normalizeWorkCertificateData(body?.data || body);
    // Token 登录：身份证以服务端会话为准，客户端传的空值会被这里补上
    const empSession = getEmployeeByRequest(request);
    if (empSession) {
      const me = db.prepare('SELECT name, id_card FROM employees WHERE id = ?').get(empSession.id) as { name: string; id_card: string | null } | undefined;
      if (me) {
        data.name = me.name;
        data.idCard = me.id_card || data.idCard;
      }
    }

    if (!data.name) {
      return NextResponse.json({ success: false, error: '姓名不能为空' }, { status: 400 });
    }
    if (!data.gender) {
      return NextResponse.json({ success: false, error: '性别不能为空' }, { status: 400 });
    }
    if (!data.idCard) {
      return NextResponse.json({ success: false, error: '身份证号码不能为空' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO work_certificate_records (
        status, name, gender, id_card, phone, purpose, data_json
      ) VALUES ('待审核', ?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.gender,
      data.idCard,
      data.phone,
      data.purpose,
      JSON.stringify(data),
    );

    return NextResponse.json({
      success: true,
      id: Number(result.lastInsertRowid),
      message: '工作证明申请提交成功',
    });
  } catch (error) {
    console.error('Create work certificate record error:', error);
    return NextResponse.json({ success: false, error: '提交工作证明申请失败' }, { status: 500 });
  }
}
