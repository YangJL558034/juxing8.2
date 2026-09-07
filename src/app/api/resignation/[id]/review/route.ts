import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { normalizeResignationData, parseResignationRow, type ResignationDbRow } from '@/lib/resignation-records';
import { canReviewPersonnel } from '@/lib/permission-check';

type ResignationData = ReturnType<typeof normalizeResignationData>;

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

function findSalaryEmployee(data: ResignationData) {
  if (data.idCard) {
    const byIdCard = db.prepare(`
      SELECT id FROM employees
      WHERE id_card IS NOT NULL AND id_card <> '' AND id_card = ?
      LIMIT 1
    `).get(data.idCard) as { id: number } | undefined;
    if (byIdCard) return byIdCard;
  }

  if (data.employeeNo) {
    const byEmployeeNo = db.prepare(`
      SELECT id FROM employees
      WHERE employee_id IS NOT NULL AND employee_id <> '' AND employee_id = ?
      LIMIT 1
    `).get(data.employeeNo) as { id: number } | undefined;
    if (byEmployeeNo) return byEmployeeNo;
  }

  const byNameAndDepartment = db.prepare(`
    SELECT id FROM employees
    WHERE name = ? AND department = ?
    LIMIT 1
  `).get(data.name, data.department) as { id: number } | undefined;
  if (byNameAndDepartment) return byNameAndDepartment;

  return db.prepare('SELECT id FROM employees WHERE name = ? LIMIT 1').get(data.name) as { id: number } | undefined;
}

function syncResignationToEmployeeFiles(data: ResignationData) {
  const matchedEmployee = findSalaryEmployee(data);
  const resignDate = data.resignationDate;
  let salaryEmployeeUpdated = 0;

  if (matchedEmployee?.id) {
    const result = db.prepare(`
      UPDATE employees
      SET status = '离职',
          resign_date = ?
      WHERE id = ?
    `).run(resignDate, matchedEmployee.id);
    salaryEmployeeUpdated = result.changes;
  }

  const onboardingResult = db.prepare(`
    UPDATE onboarding_records
    SET status = '已离职',
        employee_id = COALESCE(employee_id, ?),
        updated_at = datetime('now', '+8 hours')
    WHERE status <> '已离职'
      AND (
        (id_card IS NOT NULL AND id_card <> '' AND id_card = ?)
        OR (? IS NOT NULL AND employee_id = ?)
        OR (name = ? AND department = ?)
      )
  `).run(
    matchedEmployee?.id || null,
    data.idCard,
    matchedEmployee?.id || null,
    matchedEmployee?.id || null,
    data.name,
    data.department,
  );

  return {
    salaryEmployeeId: matchedEmployee?.id || null,
    salaryEmployeeUpdated,
    onboardingUpdated: onboardingResult.changes,
  };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });

    const row = db.prepare('SELECT * FROM resignation_records WHERE id = ? AND deleted_at IS NULL').get(id) as ResignationDbRow | undefined;
    if (!row) return NextResponse.json({ success: false, error: '员工离职申请不存在或已删除' }, { status: 404 });
    if (!canReviewPersonnel(user, row.department, row.employee_id)) {
      return NextResponse.json({ success: false, error: '只能审核本部门员工的申请' }, { status: 403 });
    }

    const body = await request.json();
    const current = parseResignationRow(row);
    const data = normalizeResignationData({ ...current.data, ...body?.data });
    const reviewerName = data.reviewerName || user.name || user.username || '';

    if (!data.name) return NextResponse.json({ success: false, error: '姓名不能为空' }, { status: 400 });
    if (!data.employeeNo) return NextResponse.json({ success: false, error: '工号不能为空' }, { status: 400 });
    if (!data.department) return NextResponse.json({ success: false, error: '部门不能为空' }, { status: 400 });
    if (!data.idCard) return NextResponse.json({ success: false, error: '身份证号码不能为空' }, { status: 400 });
    if (!data.position) return NextResponse.json({ success: false, error: '职位不能为空' }, { status: 400 });
    if (!data.hireDate) return NextResponse.json({ success: false, error: '入职日期不能为空' }, { status: 400 });
    if (!data.applyDate) return NextResponse.json({ success: false, error: '申请日期不能为空' }, { status: 400 });
    if (!data.resignationDate) return NextResponse.json({ success: false, error: '正式离职日期不能为空' }, { status: 400 });
    if (!data.handoverDate) return NextResponse.json({ success: false, error: '交接日期不能为空' }, { status: 400 });
    if (!data.resignationType) return NextResponse.json({ success: false, error: '离职类型不能为空' }, { status: 400 });
    if (!data.resignationReason) return NextResponse.json({ success: false, error: '离职原因不能为空' }, { status: 400 });
    if (!data.applicantSignatureDataUrl) return NextResponse.json({ success: false, error: '请完成手写签名' }, { status: 400 });

    const syncResult = db.transaction(() => {
      db.prepare(`
        UPDATE resignation_records
        SET status = '已审核',
            name = ?,
            employee_no = ?,
            department = ?,
            id_card = ?,
            position = ?,
            hire_date = ?,
            contract_end_date = ?,
            apply_date = ?,
            resignation_date = ?,
            handover_date = ?,
            resignation_type = ?,
            data_json = ?,
            reviewer_name = ?,
            reviewed_at = datetime('now', '+8 hours'),
            updated_at = datetime('now', '+8 hours')
        WHERE id = ?
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
        JSON.stringify({ ...data, reviewerName }),
        reviewerName,
        id,
      );

      return syncResignationToEmployeeFiles(data);
    })();

    const updated = db.prepare('SELECT * FROM resignation_records WHERE id = ?').get(id) as ResignationDbRow;
    return NextResponse.json({
      success: true,
      record: parseResignationRow(updated),
      sync: syncResult,
      message: '员工离职申请审核完成，已同步入职登记和工资工时员工状态',
    });
  } catch (error) {
    console.error('Review resignation record error:', error);
    return NextResponse.json({ success: false, error: '审核员工离职申请失败' }, { status: 500 });
  }
}
