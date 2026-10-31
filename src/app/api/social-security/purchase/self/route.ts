import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeByRequest as getEmployeeSession } from '@/lib/employee-session';
import { normalizeSocialSecurityPurchaseData } from '@/lib/social-security-purchase-records';

interface EmployeeRow {
  id: number;
  name: string;
  id_card: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  status: string | null;
  location: string | null;
}

/**
 * 小程序员工端：把本人标记为「已购买社保」。
 * 只写社保购买记录（员工管理的社保标签从这里读），不生成待审核的声明申请。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const raw = ((body as Record<string, unknown>)?.data || body) as Record<string, unknown>;
    const inputName = String(raw?.name || raw?.employeeName || '').trim();
    const inputIdCard = String(raw?.idCard || '').trim().toUpperCase();

    const session = getEmployeeSession(request);
    let employee: EmployeeRow | undefined;

    if (session) {
      employee = db.prepare(`
        SELECT id, name, id_card, department, position, phone, status, location
        FROM employees WHERE id = ?
      `).get(session.id) as EmployeeRow | undefined;
    } else if (inputName && inputIdCard) {
      employee = db.prepare(`
        SELECT id, name, id_card, department, position, phone, status, location
        FROM employees WHERE name = ? AND id_card = ?
      `).get(inputName, inputIdCard) as EmployeeRow | undefined;
    }

    if (!employee) {
      return NextResponse.json({ success: false, error: '员工身份验证失败' }, { status: 403 });
    }
    if (String(employee.status || '').includes('离职')) {
      return NextResponse.json({ success: false, error: '该员工已离职，无法提交' }, { status: 403 });
    }

    // 分类必须和后台「购买社保」页一致（management=管理部/办公室，production=车间），
    // 否则记录不会出现在对应 tab，后期导入按「分类+身份证」覆盖时也匹配不上。
    // 优先用员工的 location（办公室/车间），缺失时按部门判断：生产/车间类算车间，其余算办公室。
    const department = String(employee.department || '');
    const location = String(employee.location || '');
    let isManagement: boolean;
    if (location.includes('办公室')) isManagement = true;
    else if (location.includes('车间')) isManagement = false;
    else isManagement = !/生产|车间|产线|流水/.test(department);
    const category = isManagement ? 'management' : 'production';

    const data = normalizeSocialSecurityPurchaseData({
      employeeName: employee.name,
      idCard: employee.id_card || '',
      department,
      phone: employee.phone || '',
      category,
      insuranceStatus: '已购买',
      employmentStatus: '在职',
      domicile: String(raw?.city || raw?.bureauCity || '').trim(),
      remarks: String(raw?.reason || raw?.remarks || '').trim(),
    });

    const existing = db.prepare(`
      SELECT id FROM social_security_purchase_records
      WHERE deleted_at IS NULL
        AND (
          employee_id = ?
          OR (id_card IS NOT NULL AND id_card <> '' AND id_card = ?)
        )
      ORDER BY id DESC LIMIT 1
    `).get(employee.id, employee.id_card || '') as { id: number } | undefined;

    let recordId: number;
    if (existing) {
      db.prepare(`
        UPDATE social_security_purchase_records
        SET insurance_status = ?,
            category = ?,
            employee_id = COALESCE(employee_id, ?),
            department = COALESCE(NULLIF(department, ''), ?),
            phone = COALESCE(NULLIF(phone, ''), ?),
            updated_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).run('已购买', data.category, employee.id, data.department, data.phone, existing.id);
      recordId = existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO social_security_purchase_records (
          category, department, employee_name, domicile, id_card, phone,
          insurance_status, employment_status, remarks, data_json, employee_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.category,
        data.department,
        data.employeeName,
        data.domicile,
        data.idCard,
        data.phone,
        '已购买',
        '在职',
        data.remarks,
        JSON.stringify(data),
        employee.id,
      );
      recordId = Number(result.lastInsertRowid);
    }

    return NextResponse.json({
      success: true,
      id: recordId,
      message: '已提交，员工管理将显示「已购买社保」',
    });
  } catch (error) {
    console.error('Mark social security purchased error:', error);
    return NextResponse.json({ success: false, error: '提交失败，请稍后重试' }, { status: 500 });
  }
}
