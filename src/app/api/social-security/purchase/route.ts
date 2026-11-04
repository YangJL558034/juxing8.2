import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import {
  normalizeSocialSecurityPurchaseCategory,
  normalizeSocialSecurityPurchaseData,
  parseSocialSecurityPurchaseRow,
  type SocialSecurityPurchaseDbRow,
} from '@/lib/social-security-purchase-records';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

function insertRecord(dataInput: unknown) {
  const data = normalizeSocialSecurityPurchaseData(dataInput);
  if (!data.employeeName) throw new Error('员工姓名不能为空');
  if (!data.idCard) throw new Error('身份证号不能为空');

  const result = db.prepare(`
    INSERT INTO social_security_purchase_records (
      category, contract_status, department, employee_name, domicile, id_card, phone, bank_card,
      gender, birth_date, education, insurance_status, contract_count, contract_start_date,
      contract_term_years, contract_end_date, due_days, employment_status, resignation_date,
      confidentiality_agreement, probation_salary, remarks, data_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.category,
    data.contractStatus,
    data.department,
    data.employeeName,
    data.domicile,
    data.idCard,
    data.phone,
    data.bankCard,
    data.gender,
    data.birthDate,
    data.education,
    data.insuranceStatus,
    data.contractCount,
    data.contractStartDate,
    data.contractTermYears,
    data.contractEndDate,
    data.dueDays,
    data.employmentStatus,
    data.resignationDate,
    data.confidentialityAgreement,
    data.probationSalary,
    data.remarks,
    JSON.stringify(data),
  );

  return Number(result.lastInsertRowid);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category')?.trim();
    const employment = searchParams.get('employment')?.trim();
    const keyword = searchParams.get('keyword')?.trim();
    const deleted = searchParams.get('deleted') === '1';
    const where: string[] = [];
    const params: unknown[] = [];
    // 以员工档案状态为准（社保表里的 employment_status 可能是导入时的旧值）
    const resignedWhere = `(
      EXISTS (
        SELECT 1 FROM employees e
        WHERE COALESCE(e.status, '在职') IN ('离职', '已离职')
          AND (
            (e.id_card IS NOT NULL AND e.id_card <> '' AND e.id_card = social_security_purchase_records.id_card)
            OR e.name = social_security_purchase_records.employee_name
          )
      )
      OR COALESCE(resignation_date, '') <> ''
      OR employment_status LIKE '%离%'
    )`;

    db.prepare("DELETE FROM social_security_purchase_records WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '+8 hours', '-7 days')").run();

    if (deleted) {
      where.push("deleted_at IS NOT NULL AND deleted_at >= datetime('now', '+8 hours', '-7 days')");
    } else {
      where.push('deleted_at IS NULL');
    }
    if (category && category !== 'all') {
      where.push('category = ?');
      params.push(normalizeSocialSecurityPurchaseCategory(category));
    }
    if (!deleted && employment === 'resigned') {
      where.push(resignedWhere);
    } else if (!deleted && employment === 'active') {
      where.push(`NOT ${resignedWhere}`);
    }
    // review=pending 只返回待审核
    if (searchParams.get('review') === 'pending') {
      where.push("COALESCE(review_status, '\u5df2\u901a\u8fc7') = '\u5f85\u5ba1\u6838'");
    }
    if (keyword) {
      where.push('(employee_name LIKE ? OR id_card LIKE ? OR phone LIKE ? OR department LIKE ? OR insurance_status LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const rows = db.prepare(`
      SELECT * FROM social_security_purchase_records
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC
    `).all(...params) as SocialSecurityPurchaseDbRow[];

    // 逐条用员工档案状态覆盖「在职/离职」，避免档案已离职但社保表仍显示在职
    const resolveEmployment = db.prepare(`
      SELECT status FROM employees
      WHERE (id_card IS NOT NULL AND id_card <> '' AND id_card = ?)
         OR name = ?
      ORDER BY CASE WHEN id_card = ? THEN 0 ELSE 1 END
      LIMIT 1
    `);

    const records = rows.map((row) => {
      const record = parseSocialSecurityPurchaseRow(row);
      const employee = resolveEmployment.get(row.id_card || '', row.employee_name, row.id_card || '') as
        | { status: string | null }
        | undefined;
      const employeeStatus = String(employee?.status || '').trim();
      const resigned = ['离职', '已离职'].includes(employeeStatus);
      return {
        ...record,
        employmentStatus: resigned ? '离职' : (record.employmentStatus || '在职'),
        reviewStatus: String((row as unknown as { review_status?: string | null }).review_status || '已通过'),
        reviewRemark: String((row as unknown as { review_remark?: string | null }).review_remark || ''),
        resignedFromArchive: resigned,
      };
    });

    return NextResponse.json({ success: true, records });
  } catch (error) {
    console.error('Get social security purchase records error:', error);
    return NextResponse.json({ success: false, error: '获取购买社保记录失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const id = insertRecord(body?.data || body);
    const row = db.prepare('SELECT * FROM social_security_purchase_records WHERE id = ?').get(id) as SocialSecurityPurchaseDbRow;
    return NextResponse.json({
      success: true,
      record: parseSocialSecurityPurchaseRow(row),
      message: '购买社保记录已保存',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存购买社保记录失败';
    const status = message.includes('不能为空') ? 400 : 500;
    console.error('Create social security purchase record error:', error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
