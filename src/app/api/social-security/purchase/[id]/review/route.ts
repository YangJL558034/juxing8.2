import { NextRequest, NextResponse } from 'next/server';
import { db, logOperationServer } from '@/lib/database';
import { verifyToken } from '@/lib/auth';

/** 购买社保审核：通过 / 驳回（需填驳回原因） */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    const user = token ? await verifyToken(token) : null;
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });

    const row = db.prepare('SELECT * FROM social_security_purchase_records WHERE id = ? AND deleted_at IS NULL')
      .get(id) as { id: number; employee_name: string | null } | undefined;
    if (!row) return NextResponse.json({ success: false, error: '购买社保记录不存在' }, { status: 404 });

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const decision = (body as Record<string, unknown>)?.decision === 'reject' ? 'reject' : 'approve';
    const remark = String((body as Record<string, unknown>)?.remark || '').trim();
    if (decision === 'reject' && !remark) {
      return NextResponse.json({ success: false, error: '请填写驳回原因' }, { status: 400 });
    }

    const nextStatus = decision === 'reject' ? '已驳回' : '已通过';
    db.prepare(`
      UPDATE social_security_purchase_records
      SET review_status = ?,
          review_remark = ?,
          reviewed_at = datetime('now', '+8 hours'),
          updated_at = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(nextStatus, decision === 'reject' ? remark : '', id);

    logOperationServer({
      userId: user.id,
      userName: user.name || user.username,
      module: 'personnel',
      action: 'review_purchase',
      details: { purchaseId: id, employeeName: row.employee_name, decision, remark },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    return NextResponse.json({ success: true, message: decision === 'reject' ? '已驳回' : '审核通过' });
  } catch (error) {
    console.error('Review purchase record error:', error);
    return NextResponse.json({ success: false, error: '审核失败' }, { status: 500 });
  }
}
