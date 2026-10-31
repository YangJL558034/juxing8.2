import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeByRequest } from '@/lib/employee-session';

interface SalarySignPayload {
  recordId?: unknown;
  signature?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    // 身份只认登录会话，签名接口不再接受姓名+身份证
    const session = getEmployeeByRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }

    const body = await request.json() as SalarySignPayload;
    const recordId = Number(body.recordId);
    const signature = typeof body.signature === 'string' ? body.signature : '';

    if (!Number.isInteger(recordId) || recordId <= 0 || !signature.startsWith('data:image/')) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    const employee = db.prepare('SELECT id, name, status FROM employees WHERE id = ?').get(session.id) as {
      id: number;
      name: string;
      status: string;
    } | undefined;
    if (!employee || employee.status === '离职') {
      return NextResponse.json({ success: false, error: '员工身份验证失败' }, { status: 403 });
    }

    const salaryRecord = db.prepare(`
      SELECT w.id
      FROM work_hours_monthly w
      WHERE w.id = ?
        AND (
          w.employee_id = ?
          OR (
            w.employee_name = ?
            AND NOT EXISTS (
              SELECT 1 FROM employees linked_employee WHERE linked_employee.id = w.employee_id
            )
          )
        )
    `).get(recordId, employee.id, employee.name) as { id: number } | undefined;
    if (!salaryRecord) {
      return NextResponse.json({ success: false, error: '无权确认该工资记录' }, { status: 403 });
    }

    const result = db.prepare(`
      UPDATE work_hours_monthly
      SET signature = ?, signature_time = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(signature, recordId);
    
    if (result.changes === 0) {
      return NextResponse.json({ success: false, error: '未找到对应的工资记录' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, message: '签字成功' });
  } catch (error) {
    console.error('Sign salary error:', error);
    return NextResponse.json({ success: false, error: '签字失败' }, { status: 500 });
  }
}
