import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeSession } from '@/lib/employee-session';

function managerLocation(employeeId: number) {
  const location = (db.prepare('SELECT location FROM employees WHERE id = ?').get(employeeId) as { location?: string } | undefined)?.location;
  return String(location || '').trim().toLowerCase() === 'workshop' || location === '车间' ? 'workshop' : 'office';
}

export async function GET(request: NextRequest) {
  const session = getEmployeeSession(request);
  if (!session) return NextResponse.json({ success: false, error: '请先登录员工平台' }, { status: 401 });
  const location = managerLocation(session.id);
  if (!location) return NextResponse.json({ success: true, isManager: false, records: [] });
  const assigned = db.prepare('SELECT 1 FROM employee_self_service_managers WHERE location = ? AND employee_id = ?').get(location, session.id);
  if (!assigned) return NextResponse.json({ success: true, isManager: false, records: [] });
  const records = [
    ...db.prepare(`SELECT id, '请假申请' AS type, employee_name AS employeeName, department, status, created_at AS createdAt FROM leave_request_records WHERE deleted_at IS NULL AND status NOT IN ('已审核','已驳回') AND employee_id IN (SELECT id FROM employees WHERE location = ?) ORDER BY created_at DESC`).all(location),
    ...db.prepare(`SELECT id, '离职申请' AS type, name AS employeeName, department, status, created_at AS createdAt FROM resignation_records WHERE deleted_at IS NULL AND status NOT IN ('已审核','已驳回') AND employee_id IN (SELECT id FROM employees WHERE location = ?) ORDER BY created_at DESC`).all(location),
    ...db.prepare(`SELECT id, '转正申请' AS type, applicant_name AS employeeName, department, status, created_at AS createdAt FROM regularization_records WHERE deleted_at IS NULL AND status NOT IN ('已审核','已驳回') AND employee_id IN (SELECT id FROM employees WHERE location = ?) ORDER BY created_at DESC`).all(location),
  ];
  return NextResponse.json({ success: true, isManager: true, location, records });
}

export async function POST(request: NextRequest) {
  const session = getEmployeeSession(request);
  if (!session) return NextResponse.json({ success: false, error: '请先登录员工平台' }, { status: 401 });
  const body = await request.json() as { type?: string; id?: number; status?: '已审核' | '已驳回' };
  if (!body.id || !body.status || !['请假申请', '离职申请', '转正申请'].includes(body.type || '')) return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
  const location = managerLocation(session.id);
  const assigned = location && db.prepare('SELECT 1 FROM employee_self_service_managers WHERE location = ? AND employee_id = ?').get(location, session.id);
  if (!assigned) return NextResponse.json({ success: false, error: '无权审核申请' }, { status: 403 });
  const tables: Record<string, string> = { '请假申请': 'leave_request_records', '离职申请': 'resignation_records', '转正申请': 'regularization_records' };
  const table = tables[body.type!];
  const row = db.prepare(`SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NULL AND employee_id IN (SELECT id FROM employees WHERE location = ?)`).get(body.id, location);
  if (!row) return NextResponse.json({ success: false, error: '申请不存在或不属于管理区域' }, { status: 404 });
  if (table === 'regularization_records') {
    db.prepare(`UPDATE ${table} SET status = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`).run(body.status, body.id);
  } else {
    db.prepare(`UPDATE ${table} SET status = ?, reviewer_name = ?, reviewed_at = datetime('now', '+8 hours'), updated_at = datetime('now', '+8 hours') WHERE id = ?`).run(body.status, session.name, body.id);
  }
  return NextResponse.json({ success: true });
}
