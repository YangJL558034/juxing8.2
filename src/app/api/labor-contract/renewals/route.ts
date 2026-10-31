import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

interface RenewalListRow {
  id: number;
  employee_id: number;
  employee_name: string;
  department: string | null;
  category: string | null;
  status: string;
  old_start_date: string | null;
  old_end_date: string | null;
  new_start_date: string | null;
  new_end_date: string | null;
  term_years: string | null;
  applied_by: string | null;
  applied_at: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  remark: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get('status')?.trim();
    const where: string[] = [];
    const params: string[] = [];
    if (status && status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }

    const rows = db.prepare(`
      SELECT id, employee_id, employee_name, department, category, status,
             old_start_date, old_end_date, new_start_date, new_end_date, term_years,
             applied_by, applied_at, reviewer_name, reviewed_at, remark
      FROM labor_contract_renewals
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE status WHEN '待审核' THEN 0 ELSE 1 END, id DESC
      LIMIT 200
    `).all(...params) as RenewalListRow[];

    const counts = db.prepare(`
      SELECT status, COUNT(*) AS c FROM labor_contract_renewals GROUP BY status
    `).all() as Array<{ status: string; c: number }>;

    return NextResponse.json({
      success: true,
      records: rows.map((row) => ({
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        department: row.department || '',
        category: row.category || 'management',
        status: row.status,
        oldStartDate: row.old_start_date || '',
        oldEndDate: row.old_end_date || '',
        newStartDate: row.new_start_date || '',
        newEndDate: row.new_end_date || '',
        termYears: row.term_years || '',
        appliedBy: row.applied_by || '',
        appliedAt: row.applied_at,
        reviewerName: row.reviewer_name || '',
        reviewedAt: row.reviewed_at || '',
        remark: row.remark || '',
      })),
      counts: counts.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = item.c;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('List contract renewals error:', error);
    return NextResponse.json({ success: false, error: '获取续签申请失败' }, { status: 500 });
  }
}
