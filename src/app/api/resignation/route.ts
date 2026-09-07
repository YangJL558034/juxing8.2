import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { normalizeResignationData, parseResignationRow, type ResignationDbRow } from '@/lib/resignation-records';
import { findResignationEmployee } from '@/lib/resignation-employee';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim();
    const keyword = searchParams.get('keyword')?.trim();
    const deleted = searchParams.get('deleted') === '1';
    const where: string[] = [];
    const params: unknown[] = [];
    if (!['admin', 'super_admin'].includes(user.role)) {
      where.push(`EXISTS (SELECT 1 FROM employees e JOIN employee_self_service_managers m ON m.location = e.location WHERE (e.id = resignation_records.employee_id OR (e.name = resignation_records.name AND e.id_card = resignation_records.id_card)) AND m.user_id = ?)`);
      params.push(user.id);
    }

    db.prepare("DELETE FROM resignation_records WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '+8 hours', '-7 days')").run();

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
      where.push('(name LIKE ? OR employee_no LIKE ? OR id_card LIKE ? OR department LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const rows = db.prepare(`
      SELECT * FROM resignation_records
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC
    `).all(...params) as ResignationDbRow[];

    return NextResponse.json({ success: true, records: rows.map(parseResignationRow) });
  } catch (error) {
    console.error('Get resignation records error:', error);
    return NextResponse.json({ success: false, error: '获取员工离职申请失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const submittedData = normalizeResignationData(body?.data || body);

    if (!submittedData.name) return NextResponse.json({ success: false, error: '姓名不能为空' }, { status: 400 });
    if (!submittedData.idCard) return NextResponse.json({ success: false, error: '身份证号码不能为空' }, { status: 400 });
    const employee = findResignationEmployee(submittedData.name, submittedData.idCard);
    if (!employee) {
      return NextResponse.json({ success: false, error: '姓名和身份证号码未匹配到已审核的在职入职记录' }, { status: 400 });
    }
    const data = normalizeResignationData({
      ...submittedData,
      name: employee.name,
      idCard: employee.idCard,
      employeeNo: employee.employeeNo,
      department: employee.department,
      position: employee.position,
      hireDate: employee.hireDate,
      contractEndDate: employee.contractEndDate,
    });

    if (!data.employeeNo) return NextResponse.json({ success: false, error: '系统中的员工工号为空，请联系后台补充' }, { status: 400 });
    if (!data.department) return NextResponse.json({ success: false, error: '系统中的员工部门为空，请联系后台补充' }, { status: 400 });
    if (!data.position) return NextResponse.json({ success: false, error: '职位不能为空' }, { status: 400 });
    if (!data.hireDate) return NextResponse.json({ success: false, error: '入职日期不能为空' }, { status: 400 });
    if (!data.applyDate) return NextResponse.json({ success: false, error: '申请日期不能为空' }, { status: 400 });
    if (!data.resignationDate) return NextResponse.json({ success: false, error: '正式离职日期不能为空' }, { status: 400 });
    if (!data.handoverDate) return NextResponse.json({ success: false, error: '交接日期不能为空' }, { status: 400 });
    if (!data.resignationType) return NextResponse.json({ success: false, error: '离职类型不能为空' }, { status: 400 });
    if (!data.resignationReason) return NextResponse.json({ success: false, error: '离职原因不能为空' }, { status: 400 });
    if (!data.applicantSignatureDataUrl) return NextResponse.json({ success: false, error: '请完成手写签名' }, { status: 400 });

    const result = db.prepare(`
      INSERT INTO resignation_records (
        status, name, employee_no, department, id_card, position, hire_date,
        contract_end_date, apply_date, resignation_date, handover_date,
        resignation_type, data_json
      ) VALUES ('待审核', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.employeeNo,
      data.department,
      data.idCard,
      data.position,
      data.hireDate,
      data.contractEndDate,
      data.applyDate,
      data.resignationDate,
      data.handoverDate,
      data.resignationType,
      JSON.stringify(data),
    );

    return NextResponse.json({
      success: true,
      id: Number(result.lastInsertRowid),
      message: '员工离职申请提交成功',
    });
  } catch (error) {
    console.error('Create resignation record error:', error);
    return NextResponse.json({ success: false, error: '提交员工离职申请失败' }, { status: 500 });
  }
}
