import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';

/**
 * 公开住宿申请（无需登录）
 * 通过「姓名 + 身份证号」核验员工档案，仅在职员工可提交。
 */

const RESIGNED = ['离职', '已离职'];

function normalize(text: unknown): string {
  return String(text ?? '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const name = normalize(body.name);
    const idCard = normalize(body.idCard).toUpperCase();
    const phone = normalize(body.phone);
    const expectedCheckInDate = normalize(body.expectedCheckInDate);
    const reason = normalize(body.reason);

    if (!name) return NextResponse.json({ success: false, error: '请填写姓名' }, { status: 400 });
    if (idCard.length < 15) return NextResponse.json({ success: false, error: '请填写正确的身份证号' }, { status: 400 });
    if (!/^1\d{10}$/.test(phone)) return NextResponse.json({ success: false, error: '请填写正确的手机号' }, { status: 400 });
    if (!expectedCheckInDate) return NextResponse.json({ success: false, error: '请选择预计入住日期' }, { status: 400 });
    if (reason.length < 2) return NextResponse.json({ success: false, error: '请填写入住原因' }, { status: 400 });

    // 核验员工档案：姓名 + 身份证号匹配且在在职
    const employee = db.prepare(`
      SELECT id, name, id_card, department, position, phone, status
      FROM employees
      WHERE TRIM(name) = ? AND UPPER(TRIM(REPLACE(id_card, ' ', ''))) = ?
      LIMIT 1
    `).get(name, idCard) as
      | { id: number; name: string; department: string | null; position: string | null; phone: string | null; status: string | null }
      | undefined;

    if (!employee) {
      return NextResponse.json(
        { success: false, error: '未找到匹配的员工档案，请确认姓名和身份证号是否正确' },
        { status: 404 },
      );
    }

    if (RESIGNED.includes(String(employee.status || ''))) {
      return NextResponse.json(
        { success: false, error: '该员工已离职，无法提交住宿申请，请联系人事部门' },
        { status: 403 },
      );
    }

    // 防止重复提交待审核申请
    const pending = db.prepare(`
      SELECT id FROM dormitory_records
      WHERE status = '待审核' AND TRIM(name) = ? AND UPPER(TRIM(COALESCE(id_card, ''))) = ?
      LIMIT 1
    `).get(name, idCard) as { id: number } | undefined;

    if (pending) {
      return NextResponse.json(
        { success: false, error: '你已有一条待审核的住宿申请，请等待人事处理', existingId: pending.id },
        { status: 409 },
      );
    }

    const payload = {
      name: employee.name || name,
      phone,
      department: employee.department || '',
      position: employee.position || '',
      idCard,
      expectedCheckInDate,
      reason,
      source: 'h5-public',
    };

    const result = db.prepare(`
      INSERT INTO dormitory_records (
        status, name, phone, department, position, id_card,
        expected_check_in_date, reason, data_json
      ) VALUES ('待审核', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.name,
      payload.phone,
      payload.department,
      payload.position,
      payload.idCard,
      payload.expectedCheckInDate,
      payload.reason,
      JSON.stringify(payload),
    );

    return NextResponse.json({
      success: true,
      id: Number(result.lastInsertRowid),
      message: '住宿申请已提交，请等待人事审核',
      employee: {
        name: payload.name,
        department: payload.department,
        position: payload.position,
      },
    });
  } catch (error) {
    console.error('Public dormitory apply error:', error);
    return NextResponse.json({ success: false, error: '提交失败，请稍后重试' }, { status: 500 });
  }
}

/** 查询最近一次住宿申请状态（姓名 + 身份证号核验） */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = normalize(searchParams.get('name'));
    const idCard = normalize(searchParams.get('idCard')).toUpperCase();
    if (!name || !idCard) {
      return NextResponse.json({ success: false, error: '请填写姓名和身份证号' }, { status: 400 });
    }
    const record = db.prepare(`
      SELECT id, status, room_no, bed_no, expected_check_in_date, created_at, review_opinion
      FROM dormitory_records
      WHERE TRIM(name) = ? AND UPPER(TRIM(COALESCE(id_card, ''))) = ?
      ORDER BY id DESC LIMIT 1
    `).get(name, idCard) as Record<string, unknown> | undefined;

    if (!record) return NextResponse.json({ success: true, record: null });
    return NextResponse.json({
      success: true,
      record: {
        id: Number(record.id),
        status: String(record.status || ''),
        roomNo: String(record.room_no || ''),
        bedNo: String(record.bed_no || ''),
        expectedCheckInDate: String(record.expected_check_in_date || ''),
        createdAt: String(record.created_at || ''),
        reviewOpinion: String(record.review_opinion || ''),
      },
    });
  } catch (error) {
    console.error('Public dormitory query error:', error);
    return NextResponse.json({ success: false, error: '查询失败' }, { status: 500 });
  }
}
