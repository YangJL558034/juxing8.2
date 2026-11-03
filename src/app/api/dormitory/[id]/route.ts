import { NextRequest, NextResponse } from 'next/server';
import { db, logOperationServer } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { cleanupExpiredDormitoryDeleteRecords, ensureDormitoryDeleteRecordsTable } from '@/lib/dormitory-delete-records';
import { normalizeDormitoryData, parseDormitoryRow, type DormitoryDbRow } from '@/lib/dormitory-records';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const row = db.prepare('SELECT * FROM dormitory_records WHERE id = ?').get(id) as DormitoryDbRow | undefined;
    if (!row) {
      return NextResponse.json({ success: false, error: '住宿申请不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, record: parseDormitoryRow(row) });
  } catch (error) {
    console.error('Get dormitory record error:', error);
    return NextResponse.json({ success: false, error: '获取住宿申请详情失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const row = db.prepare('SELECT * FROM dormitory_records WHERE id = ?').get(id) as DormitoryDbRow | undefined;
    if (!row) {
      return NextResponse.json({ success: false, error: '住宿申请不存在' }, { status: 404 });
    }

    const body = await request.json();
    const current = parseDormitoryRow(row);
    const data = normalizeDormitoryData({ ...current.data, ...(body?.data || {}) });

    if (!data.name || !data.phone || !data.department || !data.position || !data.idCard || !data.expectedCheckInDate || !data.reason) {
      return NextResponse.json({ success: false, error: '请填写完整住宿申请信息' }, { status: 400 });
    }

    db.prepare(`
      UPDATE dormitory_records
      SET name = ?,
          phone = ?,
          department = ?,
          position = ?,
          id_card = ?,
          expected_check_in_date = ?,
          reason = ?,
          data_json = ?,
          updated_at = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(
      data.name,
      data.phone,
      data.department,
      data.position,
      data.idCard,
      data.expectedCheckInDate,
      data.reason,
      JSON.stringify(data),
      id,
    );

    logOperationServer({
      userId: user.id,
      userName: user.name || user.username,
      module: 'administration',
      action: 'update',
      details: { dormitoryId: id, employeeName: data.name, status: row.status },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    const updated = db.prepare('SELECT * FROM dormitory_records WHERE id = ?').get(id) as DormitoryDbRow;
    return NextResponse.json({ success: true, record: parseDormitoryRow(updated), message: '修改成功' });
  } catch (error) {
    console.error('Update dormitory record error:', error);
    return NextResponse.json({ success: false, error: '修改住宿申请失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const row = db.prepare('SELECT * FROM dormitory_records WHERE id = ?').get(id) as DormitoryDbRow | undefined;
    if (!row) {
      return NextResponse.json({ success: false, error: '住宿申请不存在' }, { status: 404 });
    }

    const record = parseDormitoryRow(row);
    if (record.status === '已入住') {
      return NextResponse.json({ success: false, error: '已入住的记录请先办理退宿，再删除' }, { status: 400 });
    }

    ensureDormitoryDeleteRecordsTable();
    cleanupExpiredDormitoryDeleteRecords();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO dormitory_delete_records (
          dormitory_record_id,
          employee_name,
          phone,
          department,
          position,
          room_no,
          bed_no,
          room_bed,
          checked_in_at,
          checked_out_at,
          deleted_by_user_id,
          deleted_by_name,
          record_snapshot
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        record.name,
        record.phone,
        record.department,
        record.position,
        record.roomNo,
        record.bedNo,
        record.roomBed,
        record.checkedInAt,
        record.checkedOutAt,
        user.id,
        user.name || user.username,
        JSON.stringify(row),
      );
      db.prepare('DELETE FROM dormitory_room_change_records WHERE dormitory_record_id = ?').run(id);
      db.prepare('DELETE FROM dormitory_records WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    logOperationServer({
      userId: user.id,
      userName: user.name || user.username,
      module: 'administration',
      action: 'delete',
      details: { dormitoryId: id, employeeName: record.name, status: record.status },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('Delete dormitory record error:', error);
    return NextResponse.json({ success: false, error: '删除住宿申请失败' }, { status: 500 });
  }
}
