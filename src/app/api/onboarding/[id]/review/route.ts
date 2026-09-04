import { NextRequest, NextResponse } from 'next/server';
import { db, logOperationServer } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { parseOnboardingRow, type OnboardingDbRow } from '@/lib/onboarding-records';
import { resolveEmployeeLocationByDepartment } from '@/lib/employee-location';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const reviewerName = String(body?.reviewerName || '').trim();
    const hrOpinion = String(body?.hrOpinion || '同意入职。').trim() || '同意入职。';

    if (!reviewerName) {
      return NextResponse.json({ success: false, error: '请填写审核人姓名' }, { status: 400 });
    }

    const row = db.prepare('SELECT * FROM onboarding_records WHERE id = ?').get(id) as OnboardingDbRow | undefined;
    if (!row) {
      return NextResponse.json({ success: false, error: '入职登记不存在' }, { status: 404 });
    }

    const record = parseOnboardingRow(row);
    const data = record.data;
    const employeeLocation = resolveEmployeeLocationByDepartment(data.department);

    const existingEmployee = db.prepare(`
      SELECT id FROM employees
      WHERE (id_card IS NOT NULL AND id_card <> '' AND id_card = ?)
         OR name = ?
      LIMIT 1
    `).get(data.idCard, data.name) as { id: number } | undefined;

    let employeeId = existingEmployee?.id || null;
    if (!employeeId) {
      const result = db.prepare(`
        INSERT INTO employees (name, id_card, phone, department, position, base_salary, status, employee_id, location, hire_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.name,
        data.idCard,
        data.phone,
        data.department,
        data.position,
        Number(data.probationSalary) || 0,
        '在职',
        '',
        employeeLocation,
        data.hireDate || null,
      );
      employeeId = Number(result.lastInsertRowid);
      db.prepare('UPDATE employees SET employee_id = ? WHERE id = ?').run(String(employeeId), employeeId);
    } else {
      db.prepare(`
        UPDATE employees
        SET name = ?,
            id_card = ?,
            phone = ?,
            department = ?,
            position = ?,
            base_salary = ?,
            status = '在职',
            resign_date = NULL,
            location = ?,
            hire_date = COALESCE(?, hire_date)
        WHERE id = ?
      `).run(
        data.name,
        data.idCard,
        data.phone,
        data.department,
        data.position,
        Number(data.probationSalary) || 0,
        employeeLocation,
        data.hireDate || null,
        employeeId,
      );
      db.prepare("UPDATE employees SET employee_id = COALESCE(NULLIF(employee_id, ''), ?) WHERE id = ?").run(String(employeeId), employeeId);
    }

    db.prepare(`
      UPDATE onboarding_records
      SET status = '已审核',
          reviewer_name = ?,
          hr_opinion = ?,
          reviewed_at = datetime('now', '+8 hours'),
          employee_id = ?,
          updated_at = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(reviewerName, hrOpinion, employeeId, id);

    logOperationServer({
      userId: user.id,
      userName: user.name || user.username,
      module: 'personnel',
      action: 'review',
      details: { onboardingId: id, employeeName: data.name, reviewerName },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });

    const updated = db.prepare('SELECT * FROM onboarding_records WHERE id = ?').get(id) as OnboardingDbRow;
    return NextResponse.json({ success: true, record: parseOnboardingRow(updated), message: '审核完成' });
  } catch (error) {
    console.error('Review onboarding record error:', error);
    return NextResponse.json({ success: false, error: '审核失败' }, { status: 500 });
  }
}
