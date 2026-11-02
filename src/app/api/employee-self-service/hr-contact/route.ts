import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeByRequest } from '@/lib/employee-session';

interface HrRow {
  id: number;
  name: string | null;
  username: string;
  role: string;
  phone: string | null;
  email: string | null;
  department: string | null;
  emp_phone: string | null;
  emp_department: string | null;
  emp_position: string | null;
}

/**
 * 员工端「HR 联系方式」：自动取管理员账号（含关联员工档案的手机号）
 * 员工需登录后访问。
 */
export async function GET(request: NextRequest) {
  try {
    const session = getEmployeeByRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }

    const rows = db.prepare(`
      SELECT u.id, u.name, u.username, u.role, u.phone, u.department, u.email,
             e.phone AS emp_phone, e.department AS emp_department, e.position AS emp_position
      FROM users u
      LEFT JOIN employees e
        ON e.id = u.employee_id
        OR (u.employee_id IS NULL AND e.name = u.name)
      WHERE u.role IN ('admin', 'super_admin')
        AND COALESCE(u.status, 'active') <> 'disabled'
      ORDER BY CASE u.role WHEN 'super_admin' THEN 0 ELSE 1 END, u.id
    `).all() as HrRow[];

    const seen = new Set<string>();
    const contacts = rows
      .map((row) => {
        const name = String(row.name || row.username || '').trim();
        const phone = String(row.phone || row.emp_phone || '').trim();
        return {
          id: row.id,
          name,
          phone,
          email: String(row.email || '').trim(),
          department: String(row.emp_department || row.department || '').trim(),
          position: String(row.emp_position || '').trim(),
          role: row.role,
        };
      })
      // 只要求有名字；没有手机号时用邮箱兜底（占位邮箱 example.com 不算）
      .filter((item) => item.name && (
        Boolean(item.phone) || (Boolean(item.email) && !/@example\.com$/i.test(item.email))
      ))
      .filter((item) => {
        // 同名同号去重
        const key = `${item.name}|${item.phone}|${item.email}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      // 有手机号的排在前面
      .sort((a, b) => Number(Boolean(b.phone)) - Number(Boolean(a.phone)));

    return NextResponse.json({ success: true, contacts }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Get HR contact error:', error);
    return NextResponse.json({ success: false, error: '获取 HR 联系方式失败' }, { status: 500 });
  }
}
