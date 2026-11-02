import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeByRequest } from '@/lib/employee-session';
import { readHrContacts } from '@/lib/hr-contact';

/**
 * 员工端「HR 联系方式」
 * 1) 优先用后台「系统设置 → HR 联系方式」里配置的联系人
 * 2) 未配置时，回退到人事/行政岗位员工的手机号（不展示管理员账号）
 */
export async function GET(request: NextRequest) {
  try {
    const session = getEmployeeByRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }

    // 1) 后台配置的联系人
    const configured = readHrContacts();
    if (configured.length > 0) {
      return NextResponse.json(
        {
          success: true,
          source: 'config',
          contacts: configured.map((item, index) => ({
            id: index + 1,
            name: item.name,
            phone: item.phone,
            email: '',
            department: item.label || '',
            position: '',
            role: 'hr',
          })),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // 2) 回退：人事/行政岗位的员工（排除管理员账号）
    const rows = db.prepare(`
      SELECT e.id, e.name, e.phone, e.email, e.department, e.position
      FROM employees e
      WHERE COALESCE(e.status, '在职') <> '离职'
        AND e.phone IS NOT NULL AND TRIM(e.phone) <> ''
        AND (
          e.position LIKE '%人事%' OR e.position LIKE '%行政%' OR e.position LIKE '%HR%'
          OR e.department LIKE '%人事%' OR e.department LIKE '%行政%' OR e.department LIKE '%人力资源%'
        )
        AND NOT EXISTS (
          SELECT 1 FROM users u WHERE u.name = e.name AND u.role IN ('admin', 'super_admin')
        )
      ORDER BY e.id
      LIMIT 10
    `).all() as Array<{
      id: number;
      name: string;
      phone: string;
      email: string | null;
      department: string | null;
      position: string | null;
    }>;

    const contacts = rows
      .map((row) => ({
        id: row.id,
        name: String(row.name || '').trim(),
        phone: String(row.phone || '').trim(),
        email: String(row.email || '').trim(),
        department: String(row.department || '').trim(),
        position: String(row.position || '').trim(),
        role: 'hr',
      }))
      .filter((item) => item.name && item.phone);

    return NextResponse.json(
      { success: true, source: 'employee', contacts },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Get HR contact error:', error);
    return NextResponse.json({ success: false, error: '获取 HR 联系方式失败' }, { status: 500 });
  }
}
