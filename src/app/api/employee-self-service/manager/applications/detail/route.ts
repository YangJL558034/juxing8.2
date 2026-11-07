import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeByRequest as getEmployeeSession } from '@/lib/employee-session';

const TABLES: Record<string, string> = {
  请假申请: 'leave_request_records',
  离职申请: 'resignation_records',
  转正申请: 'regularization_records',
};

/** 字段中文名（覆盖数据库列名与 data_json 里的驼峰字段） */
const LABELS: Record<string, string> = {
  employee_name: '申请人', name: '申请人', applicant_name: '申请人', applicantName: '申请人',
  department: '部门', position: '岗位', status: '状态',
  created_at: '申请时间', createdAt: '申请时间', application_date: '申请日期', applicationDate: '申请日期', fillDate: '填表日期', applicantDate: '申请日期',
  reviewer_name: '审核人', reviewed_at: '审核时间', review_opinion: '审核意见', review_remark: '审核意见', reject_reason: '驳回原因', reviewComment: '审核意见',
  phone: '联系电话', id_card: '身份证号', employee_no: '工号',
  hire_date: '入职日期', hireDate: '入职日期',
  regularization_date: '转正日期', regularizationDate: '转正日期', expected_date: '期望转正日期', probation_months: '试用期（月）',
  workSummary: '工作小结', work_summary: '工作小结', reason: '原因', leave_reason: '请假原因', leave_type: '请假类型', leaveType: '请假类型',
  start_date: '开始日期', end_date: '结束日期', startDate: '开始日期', endDate: '结束日期',
  days: '天数', hours: '小时数', resignation_date: '离职日期', resignationDate: '离职日期', last_work_date: '最后工作日',
  remark: '备注', reviewedBy: '审核人', applicantSignature: '申请人签名', signature: '签名',
};

/** 不展示的字段 */
const SKIP = new Set([
  'id', 'employee_id', 'deleted_at', 'updated_at', 'created_at', 'data_json', 'data', 'detail_json', 'extra_json',
  'applicant_signature', 'signature_time', 'signature_data', 'avatar_url',
]);

function looksLikeBase64(value: string): boolean {
  if (value.startsWith('data:image')) return true;
  if (value.length > 300 && /^[A-Za-z0-9+/=\s]+$/.test(value)) return true;
  return false;
}

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
    if (!row) return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });

    const managerRow = db.prepare('SELECT location FROM employee_self_service_managers WHERE employee_id = ?')
      .get(session.id) as { location: string } | undefined;
    if (!managerRow?.location) return NextResponse.json({ success: false, error: '无审核权限' }, { status: 403 });

    // 合并数据库列与 data_json 中的补充字段
    const merged: Record<string, unknown> = { ...row };
    for (const key of ['data_json', 'data', 'detail_json', 'extra_json']) {
      const raw = row[key];
      if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          for (const [k, v] of Object.entries(parsed)) {
            if (merged[k] === undefined || merged[k] === null || merged[k] === '') merged[k] = v;
          }
        } catch { /* 忽略解析失败 */ }
      }
    }

    const fields: Array<{ label: string; value: string }> = [];
    const seenLabel = new Set<string>();
    const seenValue = new Set<string>();

    for (const [key, value] of Object.entries(merged)) {
      if (SKIP.has(key)) continue;
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue;
      const label = LABELS[key];
      // 没有中文标签的英文行不展示，避免出现 regularization_date 这类乱码
      if (!label) continue;
      if (seenLabel.has(label)) continue;

      let text = String(value).trim();
      if (!text) continue;
      if (key.toLowerCase().includes('signature')) {
        text = '已签名';
      } else if (looksLikeBase64(text)) {
        continue;
      }
      if (key === 'id_card' && text.length >= 10) {
        text = text.slice(0, 6) + '********' + text.slice(-4);
      }
      if (seenValue.has(label + '|' + text)) continue;

      seenLabel.add(label);
      seenValue.add(label + '|' + text);
      fields.push({ label, value: text });
    }

    // 状态优先展示数据库真实值
    const statusIndex = fields.findIndex((item) => item.label === '状态');
    if (statusIndex >= 0) fields[statusIndex].value = String(row.status || fields[statusIndex].value);

    return NextResponse.json({ success: true, type, id, fields });
  } catch (error) {
    console.error('Manager application detail error:', error);
    return NextResponse.json({ success: false, error: '获取详情失败' }, { status: 500 });
  }
}
