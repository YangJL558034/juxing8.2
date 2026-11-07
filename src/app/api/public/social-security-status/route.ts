import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';


function ensurePurchaseColumns() {
  try {
    const cols = (db.prepare('PRAGMA table_info(social_security_purchase_records)').all() as Array<{ name: string }>).map((c) => c.name);
    if (!cols.includes('review_status')) db.exec("ALTER TABLE social_security_purchase_records ADD COLUMN review_status TEXT DEFAULT '已通过'");
    if (!cols.includes('review_remark')) db.exec('ALTER TABLE social_security_purchase_records ADD COLUMN review_remark TEXT');
    if (!cols.includes('reviewed_at')) db.exec('ALTER TABLE social_security_purchase_records ADD COLUMN reviewed_at TEXT');
  } catch { /* 忽略 */ }
}

/** 公开查询：按姓名+身份证查看社保申请状态（购买 / 不购买协议） */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = String(searchParams.get('name') || '').trim();
    const idCard = String(searchParams.get('idCard') || '').trim().toUpperCase();

    if (!name || idCard.length < 15) {
      return NextResponse.json({ success: false, error: '请填写姓名和身份证号' }, { status: 400 });
    }

    const employee = db.prepare(`
      SELECT id, name, department, position, status
      FROM employees
      WHERE TRIM(name) = ? AND UPPER(TRIM(REPLACE(COALESCE(id_card, ''), ' ', ''))) = ?
      LIMIT 1
    `).get(name, idCard) as { id: number; name: string; department: string | null; position: string | null; status: string | null } | undefined;

    if (!employee) {
      return NextResponse.json({ success: false, error: '未找到匹配的员工档案，请确认姓名和身份证号' }, { status: 404 });
    }

    if (['离职', '已离职'].includes(String(employee.status || ''))) {
      return NextResponse.json({ success: false, error: '该员工已离职，无法提交申请' }, { status: 403 });
    }

    // 购买社保记录
    ensurePurchaseColumns();
    let purchase: { id: number; data_json: string | null; review_status?: string | null; review_remark?: string | null; created_at?: string | null } | undefined;
    try {
      purchase = db.prepare(`
        SELECT id, data_json, review_status, review_remark, created_at
        FROM social_security_purchase_records
        WHERE TRIM(employee_name) = ? AND UPPER(TRIM(COALESCE(id_card, ''))) = ?
        ORDER BY id DESC LIMIT 1
      `).get(name, idCard) as typeof purchase;
    } catch {
      // 旧库缺少 review 列时退回最小查询
      purchase = db.prepare(`
        SELECT id, data_json, created_at
        FROM social_security_purchase_records
        WHERE TRIM(employee_name) = ? AND UPPER(TRIM(COALESCE(id_card, ''))) = ?
        ORDER BY id DESC LIMIT 1
      `).get(name, idCard) as typeof purchase;
    }

    let purchaseInfo = null as null | { id: number; status: string; remark: string; createdAt: string };
    if (purchase) {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(purchase.data_json || '{}'); } catch { parsed = {}; }
      const status = String(purchase.review_status || parsed.reviewStatus || '已通过');
      purchaseInfo = {
        id: Number(purchase.id),
        status,
        remark: String(purchase.review_remark || parsed.reviewRemark || ''),
        createdAt: String(purchase.created_at || ''),
      };
    }

    // 不购买社保协议（声明记录）
    let waiverInfo = null as null | { id: number; status: string; createdAt: string };
    try {
      let waiver: { id: number; status?: string | null; created_at?: string | null } | undefined;
      try {
        waiver = db.prepare(`
          SELECT id, status, created_at
          FROM social_security_records
          WHERE TRIM(name) = ? AND UPPER(TRIM(COALESCE(id_card, ''))) = ?
          ORDER BY id DESC LIMIT 1
        `).get(name, idCard) as typeof waiver;
      } catch {
        waiver = db.prepare(`
          SELECT id FROM social_security_records
          WHERE TRIM(name) = ? AND UPPER(TRIM(COALESCE(id_card, ''))) = ?
          ORDER BY id DESC LIMIT 1
        `).get(name, idCard) as typeof waiver;
      }
      if (waiver) {
        waiverInfo = { id: Number(waiver.id), status: String(waiver.status || '已提交'), createdAt: String(waiver.created_at || '') };
      }
    } catch {
      waiverInfo = null;
    }

    return NextResponse.json({
      success: true,
      employee: { name: employee.name, department: employee.department || '', position: employee.position || '' },
      purchase: purchaseInfo,
      waiver: waiverInfo,
    });
  } catch (error) {
    console.error('Public social security status error:', error);
    return NextResponse.json({ success: false, error: '查询失败，请稍后重试' }, { status: 500 });
  }
}
