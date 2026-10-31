import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

function chinaNowMinute() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

interface RenewalRow {
  id: number;
  employee_id: number;
  employee_name: string;
  id_card: string | null;
  status: string;
  new_start_date: string | null;
  new_end_date: string | null;
  term_years: string | null;
}

/** 管理员审核续签申请：通过后才会把新合同信息写进员工档案 */
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

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const action = String((body as Record<string, unknown>)?.action || '').trim();
    const remark = String((body as Record<string, unknown>)?.remark || '').trim();
    const reviewerName = String((body as Record<string, unknown>)?.reviewerName || user.name || user.username || '').trim();

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    const renewal = db.prepare(`
      SELECT id, employee_id, employee_name, id_card, status, new_start_date, new_end_date, term_years
      FROM labor_contract_renewals WHERE id = ?
    `).get(id) as RenewalRow | undefined;

    if (!renewal) {
      return NextResponse.json({ success: false, error: '续签申请不存在' }, { status: 404 });
    }
    if (renewal.status !== '待审核') {
      return NextResponse.json({ success: false, error: '该申请已处理过' }, { status: 400 });
    }

    const now = chinaNowMinute();

    if (action === 'reject') {
      db.prepare(`
        UPDATE labor_contract_renewals
        SET status = '已驳回', reviewer_name = ?, reviewed_at = ?, remark = ?
        WHERE id = ?
      `).run(reviewerName, now, remark, id);
      return NextResponse.json({ success: true, message: '已驳回续签申请' });
    }

    const purchase = db.prepare(`
      SELECT id FROM social_security_purchase_records
      WHERE deleted_at IS NULL
        AND (employee_id = ? OR (id_card IS NOT NULL AND id_card <> '' AND id_card = ?))
      ORDER BY id DESC LIMIT 1
    `).get(renewal.employee_id, renewal.id_card || '') as { id: number } | undefined;

    if (!purchase) {
      return NextResponse.json({ success: false, error: '找不到该员工的合同档案，无法写入新合同' }, { status: 400 });
    }

    const apply = db.transaction(() => {
      db.prepare(`
        UPDATE social_security_purchase_records
        SET contract_status = '已签订',
            contract_start_date = ?,
            contract_end_date = ?,
            contract_term_years = ?,
            contract_signed_at = ?,
            contract_reminder_sent_at = NULL,
            updated_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).run(renewal.new_start_date || '', renewal.new_end_date || '', renewal.term_years || '', now, purchase.id);

      db.prepare(`
        UPDATE labor_contract_renewals
        SET status = '已通过', reviewer_name = ?, reviewed_at = ?, remark = ?
        WHERE id = ?
      `).run(reviewerName, now, remark, id);
    });
    apply();

    return NextResponse.json({ success: true, message: '续签已通过，合同信息已更新' });
  } catch (error) {
    console.error('Review contract renewal error:', error);
    return NextResponse.json({ success: false, error: '审核失败' }, { status: 500 });
  }
}
