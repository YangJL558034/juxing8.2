import { NextRequest, NextResponse } from 'next/server';
import { db, logOperationServer } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import {
  cleanupExpiredDormitoryDeleteRecords,
  ensureDormitoryDeleteRecordsTable,
  getDeleteRecordAsDormitoryRow,
  type DormitoryDeleteDbRow,
} from '@/lib/dormitory-delete-records';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    ensureDormitoryDeleteRecordsTable();
    cleanupExpiredDormitoryDeleteRecords();

    const { id } = await params;
    const deleteRow = db.prepare(`
      SELECT *, datetime(deleted_at, '+1 month') AS expires_at
      FROM dormitory_delete_records
      WHERE id = ?
        AND deleted_at >= datetime('now', '+8 hours', '-1 month')
    `).get(id) as DormitoryDeleteDbRow | undefined;
    if (!deleteRow) {
      return NextResponse.json({ success: false, error: '删除记录不存在或已过期' }, { status: 404 });
    }

    const row = getDeleteRecordAsDormitoryRow(deleteRow);
    // 恢复时还原删除前的状态（老数据没有 status 时按已退宿处理）
    const restoreStatus = String((row as unknown as { status?: string }).status || '已退宿') || '已退宿';
    const existing = db.prepare('SELECT id FROM dormitory_records WHERE id = ?').get(row.id);
    if (existing) {
      return NextResponse.json({ success: false, error: '原住宿记录ID已存在，无法恢复' }, { status: 400 });
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO dormitory_records (
          id,
          status,
          name,
          phone,
          department,
          position,
          id_card,
          expected_check_in_date,
          reason,
          data_json,
          reviewer_name,
          review_opinion,
          reviewed_at,
          room_no,
          bed_no,
          room_bed,
          key_issued,
          handler_name,
          checked_in_at,
          checkout_apply_date,
          move_out_date,
          checkout_reason,
          key_returned,
          checkout_handler_name,
          checked_out_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
      `).run(
        row.id,
        restoreStatus,
        row.name,
        row.phone,
        row.department,
        row.position,
        row.id_card,
        row.expected_check_in_date,
        row.reason,
        row.data_json,
        row.reviewer_name,
        row.review_opinion,
        row.reviewed_at,
        row.room_no,
        row.bed_no,
        row.room_bed,
        row.key_issued,
        row.handler_name,
        row.checked_in_at,
        row.checkout_apply_date,
        row.move_out_date,
        row.checkout_reason,
        row.key_returned,
        row.checkout_handler_name,
        row.checked_out_at,
        row.created_at,
      );
      db.prepare('DELETE FROM dormitory_delete_records WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    logOperationServer({
      userId: user.id,
      userName: user.name || user.username,
      module: 'administration',
      action: 'restore-deleted-dormitory',
      details: { deleteRecordId: id, dormitoryId: row.id, employeeName: row.name },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    return NextResponse.json({ success: true, message: '删除记录已恢复到已退宿列表' });
  } catch (error) {
    console.error('Restore deleted dormitory record error:', error);
    return NextResponse.json({ success: false, error: '恢复删除记录失败' }, { status: 500 });
  }
}
