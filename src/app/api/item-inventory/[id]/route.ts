import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/database';
import { hasPermission } from '@/lib/permission-check';
import type { ItemInventoryRecord } from '@/types/item-management';

interface ItemInventoryRow {
  id: number;
  name: string;
  category: string | null;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  remark: string | null;
  image_url?: string | null;
  claimed_quantity: number | null;
  pending_quantity: number | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

interface UpdateItemBody {
  name?: unknown;
  category?: unknown;
  unit?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  remark?: unknown;
  imageUrl?: unknown;
}

function asText(value: unknown) {
  return String(value ?? '').trim();
}

function asNonNegativeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function mapItem(row: ItemInventoryRow): ItemInventoryRecord {
  const quantity = Number(row.quantity || 0);
  const unitPrice = Number(row.unit_price || 0);
  const claimedQuantity = Number(row.claimed_quantity || 0);
  const pendingQuantity = Number(row.pending_quantity || 0);

  return {
    id: row.id,
    name: row.name,
    category: row.category || '',
    unit: row.unit || '个',
    quantity,
    unitPrice,
    remark: row.remark || '',
    imageUrl: row.image_url || '',
    claimedQuantity,
    pendingQuantity,
    remainingQuantity: quantity,
    totalValue: Number((quantity * unitPrice).toFixed(2)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireAdmin(request: NextRequest) {
  const user = await getCurrentUser(request.headers.get('cookie'));
  if (!user) return { response: NextResponse.json({ success: false, error: '未登录' }, { status: 401 }) };
  if (!hasPermission(user, 'administration')) {
    return { response: NextResponse.json({ success: false, error: '无权管理物品库' }, { status: 403 }) };
  }
  return { response: null };
}

async function getId(context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getItemById(id: number) {
  return db.prepare(`
    SELECT
      i.*,
      COALESCE(SUM(CASE WHEN c.status = '已审核' AND c.deleted_at IS NULL THEN c.quantity ELSE 0 END), 0) AS claimed_quantity,
      COALESCE(SUM(CASE WHEN c.status = '待审核' AND c.deleted_at IS NULL THEN c.quantity ELSE 0 END), 0) AS pending_quantity
    FROM item_inventory i
    LEFT JOIN item_claim_records c ON c.item_id = i.id
    WHERE i.id = ? AND i.deleted_at IS NULL
    GROUP BY i.id
  `).get(id) as ItemInventoryRow | undefined;
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const id = await getId(context);
    if (!id) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    const existing = getItemById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: '物品不存在或已删除' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({})) as UpdateItemBody;
    const name = asText(body.name);
    const category = asText(body.category);
    const unit = asText(body.unit) || '个';
    const quantity = Math.floor(asNonNegativeNumber(body.quantity));
    const unitPrice = asNonNegativeNumber(body.unitPrice);
    const remark = asText(body.remark);
    const imageUrl = asText(body.imageUrl);

    if (!name) {
      return NextResponse.json({ success: false, error: '请填写物品名称' }, { status: 400 });
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE item_inventory
        SET name = ?,
            category = ?,
            unit = ?,
            quantity = ?,
            unit_price = ?,
            remark = ?,
            image_url = ?,
            updated_at = datetime('now', '+8 hours')
        WHERE id = ? AND deleted_at IS NULL
      `).run(name, category, unit, quantity, unitPrice, remark, imageUrl, id);

      db.prepare(`
        UPDATE item_claim_records
        SET item_name = ?,
            updated_at = datetime('now', '+8 hours')
        WHERE item_id = ? AND deleted_at IS NULL
      `).run(name, id);
    })();

    const updated = getItemById(id);
    if (!updated) {
      return NextResponse.json({ success: false, error: '物品不存在或已删除' }, { status: 404 });
    }

    return NextResponse.json({ success: true, item: mapItem(updated), message: '物品已修改' });
  } catch (error) {
    console.error('Update item inventory error:', error);
    return NextResponse.json({ success: false, error: '修改物品失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const id = await getId(context);
    if (!id) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    const existing = getItemById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: '物品不存在或已删除' }, { status: 404 });
    }

    const pending = db.prepare(`
      SELECT COUNT(*) AS count
      FROM item_claim_records
      WHERE item_id = ? AND status = '待审核' AND deleted_at IS NULL
    `).get(id) as { count: number };
    if (Number(pending.count || 0) > 0) {
      return NextResponse.json({ success: false, error: '该物品还有待审核领用申请，请先处理后再删除' }, { status: 400 });
    }

    db.prepare(`
      UPDATE item_inventory
      SET deleted_at = datetime('now', '+8 hours'),
          updated_at = datetime('now', '+8 hours')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);

    return NextResponse.json({ success: true, message: '物品已删除' });
  } catch (error) {
    console.error('Delete item inventory error:', error);
    return NextResponse.json({ success: false, error: '删除物品失败' }, { status: 500 });
  }
}
