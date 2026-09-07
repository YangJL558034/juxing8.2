import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { normalizeRegularizationData, parseRegularizationRow, type RegularizationDbRow } from '@/lib/regularization-records';

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
    const keyword = searchParams.get('keyword')?.trim();
    const deleted = searchParams.get('deleted') === '1';
    const where: string[] = [];
    const params: unknown[] = [];
    if (!['admin', 'super_admin'].includes(user.role)) {
      where.push(`EXISTS (SELECT 1 FROM employees e JOIN employee_self_service_managers m ON m.location = e.location WHERE (e.id = regularization_records.employee_id OR e.name = regularization_records.applicant_name) AND m.user_id = ?)`);
      params.push(user.id);
    }

    db.prepare("DELETE FROM regularization_records WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '+8 hours', '-7 days')").run();

    where.push(deleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL');

    if (keyword) {
      where.push('(applicant_name LIKE ? OR department LIKE ? OR position LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const rows = db.prepare(`
      SELECT * FROM regularization_records
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC
    `).all(...params) as RegularizationDbRow[];

    return NextResponse.json({
      success: true,
      records: rows.map(parseRegularizationRow),
    });
  } catch (error) {
    console.error('Get regularization records error:', error);
    return NextResponse.json({ success: false, error: '获取转正申请列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = normalizeRegularizationData(body?.data || body);

    if (!data.applicantName) {
      return NextResponse.json({ success: false, error: '申请人不能为空' }, { status: 400 });
    }
    if (!data.department) {
      return NextResponse.json({ success: false, error: '部门不能为空' }, { status: 400 });
    }
    if (!data.position) {
      return NextResponse.json({ success: false, error: '岗位不能为空' }, { status: 400 });
    }
    if (!data.hireDate) {
      return NextResponse.json({ success: false, error: '入职日期不能为空' }, { status: 400 });
    }
    if (!data.regularizationDate) {
      return NextResponse.json({ success: false, error: '转正日期不能为空' }, { status: 400 });
    }
    if (!data.workSummary) {
      return NextResponse.json({ success: false, error: '试用期工作小结不能为空' }, { status: 400 });
    }
    if (!data.applicantSignatureDataUrl) {
      return NextResponse.json({ success: false, error: '请完成手写签名' }, { status: 400 });
    }

    const result = db.prepare(`
      INSERT INTO regularization_records (
        status, applicant_name, department, position, hire_date, regularization_date, data_json
      ) VALUES ('待处理', ?, ?, ?, ?, ?, ?)
    `).run(
      data.applicantName,
      data.department,
      data.position,
      data.hireDate,
      data.regularizationDate,
      JSON.stringify(data),
    );

    return NextResponse.json({
      success: true,
      id: Number(result.lastInsertRowid),
      message: '转正申请提交成功',
    });
  } catch (error) {
    console.error('Create regularization record error:', error);
    return NextResponse.json({ success: false, error: '提交转正申请失败' }, { status: 500 });
  }
}
