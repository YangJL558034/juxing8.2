import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeByRequest as getEmployeeSession } from '@/lib/employee-session';

const TABLES: Record<string, string> = {
  请假申请: 'leave_request_records',
  离职申请: 'resignation_records',
  转正申请: 'regularization_records',
};

/** 审核中心：查看某条申请的完整内容 */
export async function GET(request: NextRequest) {
  try {
    const session = getEmployeeSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: '请先登录员工平台' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const type = String(searchParams.get('type') || '');
    const id = Number(searchParams.get('id') || 0);
    const table = TABLES[type];
    if (!table || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });
    }

    // 只允许查看管理范围内的申请
    const managerRow = db.prepare('SELECT location FROM employee_self_service_managers WHERE employee_id = ?').get(session.id) as { location: string } | undefined;
    if (!managerRow?.location) {
      return NextResponse.json({ success: false, error: '无审核权限' }, { status: 403 });
    }

    let payload: Record<string, unknown> = {};
    for (const key of ['data_json', 'data', 'detail_json', 'extra_json']) {
      const raw = row[key];
      if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try { payload = JSON.parse(raw) as Record<string, unknown>; break; } catch { /* 继续尝试 */ }
      }
    }

    // 只返回非空字段，便于前端直接渲染
    const fields: Array<{ label: string; value: string }> = [];
    const push = (label: string, value: unknown) => {
      const text = String(value ?? '').trim();
      if (text && text !== 'null' && text !== 'undefined') fields.push({ label, value: text });
    };
    push('申请类型', type);
    push('申请人', row.employee_name || row.name || row.applicant_name);
    push('部门', row.department);
    push('状态', row.status);
    push('申请时间', row.created_at);
    push('审核人', row.reviewer_name);
    push('审核时间', row.reviewed_at);
    push('审核意见', row.review_opinion || row.review_remark || row.reject_reason);

    const skipKeys = new Set(['id', 'employee_id', 'deleted_at', 'data_json', 'data', 'detail_json', 'extra_json', 'created_at', 'updated_at', 'employee_name', 'name', 'applicant_name', 'department', 'status', 'reviewer_name', 'reviewed_at', 'review_opinion', 'review_remark', 'reject_reason']);
    const labelMap: Record<string, string> = {
      leave_type: '请假类型', leave_reason: '请假原因', reason: '原因', start_date: '开始日期', end_date: '结束日期',
      start_time: '开始时间', end_time: '结束时间', days: '天数', hours: '小时数', remark: '备注',
      resignation_date: '离职日期', last_work_date: '最后工作日', position: '岗位',
      probation_months: '试用期（月）', apply_date: '申请日期', hire_date: '入职日期', expected_date: '转正日期',
      signature: '签名', phone: '联系电话', id_card: '身份证号', employee_no: '工号', leave_days: '请假天数',
    };
    for (const [key, value] of Object.entries(row)) {
      if (skipKeys.has(key)) continue;
      if (value === null || value === undefined || value === '') continue;
      if (typeof value === 'object') continue;
      const label = labelMap[key] || key;
      push(label, value);
    }
    for (const [key, value] of Object.entries(payload)) {
      if (value === null || value === undefined || value === '') continue;
      if (typeof value === 'object') continue;
      const label = labelMap[key] || key;
      if (fields.some((item) => item.label === label)) continue;
      push(label, value);
    }

    return NextResponse.json({ success: true, type, id, fields });
  } catch (error) {
    console.error('Manager application detail error:', error);
    return NextResponse.json({ success: false, error: '获取详情失败' }, { status: 500 });
  }
}
