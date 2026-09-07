import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { normalizeRegularizationData, parseRegularizationRow, type RegularizationDbRow } from '@/lib/regularization-records';
import { canReviewPersonnel } from '@/lib/permission-check';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    const row = db.prepare('SELECT * FROM regularization_records WHERE id = ?').get(id) as RegularizationDbRow | undefined;
    if (!row) {
      return NextResponse.json({ success: false, error: '转正申请不存在' }, { status: 404 });
    }
    if (!canReviewPersonnel(user, row.department)) {
      return NextResponse.json({ success: false, error: '只能审核本部门员工的申请' }, { status: 403 });
    }

    const body = await request.json();
    const current = parseRegularizationRow(row);
    const data = normalizeRegularizationData({
      ...current.data,
      ...body?.data,
    });

    db.prepare(`
      UPDATE regularization_records
      SET status = '已审核',
          data_json = ?,
          updated_at = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(JSON.stringify(data), id);

    const updated = db.prepare('SELECT * FROM regularization_records WHERE id = ?').get(id) as RegularizationDbRow;
    return NextResponse.json({
      success: true,
      record: parseRegularizationRow(updated),
      message: '转正申请审核完成',
    });
  } catch (error) {
    console.error('Review regularization record error:', error);
    return NextResponse.json({ success: false, error: '审核转正申请失败' }, { status: 500 });
  }
}
