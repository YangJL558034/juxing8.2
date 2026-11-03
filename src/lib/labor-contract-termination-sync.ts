import { db } from '@/lib/database';
import { normalizeLaborContractTerminationData } from '@/lib/labor-contract-termination-records';

function hasSignedContract(name: string) {
  const employee = db.prepare('SELECT id, id_card FROM employees WHERE name = ? LIMIT 1')
    .get(name) as { id: number; id_card: string | null } | undefined;
  if (!employee) return false;
  const row = db.prepare(`
    SELECT contract_status FROM social_security_purchase_records
    WHERE deleted_at IS NULL
      AND (employee_id = ? OR (id_card IS NOT NULL AND id_card <> '' AND id_card = ?))
    ORDER BY id DESC LIMIT 1
  `).get(employee.id, employee.id_card || '') as { contract_status: string | null } | undefined;
  const status = String(row?.contract_status || '');
  return status.includes('已签') || status.includes('正常');
}

function hasTerminationRecord(name: string) {
  const row = db.prepare(`
    SELECT id FROM labor_contract_termination_records WHERE employee_name = ? LIMIT 1
  `).get(name) as { id: number } | undefined;
  return Boolean(row);
}

function addDays(dateStr: string, days: number) {
  const parsed = new Date(`${dateStr}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  parsed.setDate(parsed.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * 员工辞职审核通过 → 自动生成一条「解除劳动合同」记录。
 * 只在员工原本签过合同、且还没有解除记录时创建。
 */
export function createTerminationFromResignation(params: {
  name: string;
  resignationDate: string | null;
  reviewedAt: string | null;
}): boolean {
  const name = String(params.name || '').trim();
  if (!name) return false;
  if (hasTerminationRecord(name)) return false;
  if (!hasSignedContract(name)) return false;

  const terminationDate = String(params.resignationDate || '').slice(0, 10);
  if (!terminationDate) return false;

  const data = normalizeLaborContractTerminationData({
    employeeName: name,
    honorific: '先生',
    terminationDate,
    reason: '员工主动提出辞职，双方协商一致解除劳动合同',
    procedureDeadline: addDays(terminationDate, 7),
    noticeDate: String(params.reviewedAt || '').slice(0, 10) || terminationDate,
  });

  db.prepare(`
    INSERT INTO labor_contract_termination_records (
      employee_name, honorific, termination_date, reason, procedure_deadline,
      company_name, notice_date, data_json, created_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.employeeName,
    data.honorific,
    data.terminationDate,
    data.reason,
    data.procedureDeadline,
    data.companyName,
    data.noticeDate,
    JSON.stringify(data),
    '系统自动生成（辞职通过）',
  );
  return true;
}

/** 补全历史数据：把所有已通过但还没生成解除通知书的辞职补上 */
export function materializeResignationTerminations() {
  const rows = db.prepare(`
    SELECT r.name, r.resignation_date, r.reviewed_at
    FROM resignation_records r
    WHERE r.status = '已审核' AND r.deleted_at IS NULL
    ORDER BY r.id DESC
  `).all() as Array<{ name: string; resignation_date: string | null; reviewed_at: string | null }>;

  const created: string[] = [];
  for (const row of rows) {
    if (createTerminationFromResignation({
      name: row.name,
      resignationDate: row.resignation_date,
      reviewedAt: row.reviewed_at,
    })) {
      created.push(row.name);
    }
  }
  return created;
}

/**
 * 离职联动：社保/合同记录标记为离职、合同终止。
 */
export function markEmployeeResignedInSocialSecurity(params: {
  employeeId: number | null;
  idCard: string;
}): number {
  const { employeeId, idCard } = params;
  try {
    const result = db.prepare(`
      UPDATE social_security_purchase_records
      SET employment_status = '离职',
          contract_status = CASE
            WHEN contract_status LIKE '%已签%' OR contract_status LIKE '%正常%' THEN '已终止'
            ELSE contract_status
          END,
          insurance_status = CASE
            WHEN insurance_status LIKE '%离职%' THEN insurance_status
            ELSE '离职'
          END
      WHERE deleted_at IS NULL
        AND (
          (? IS NOT NULL AND employee_id = ?)
          OR (id_card IS NOT NULL AND id_card <> '' AND id_card = ?)
        )
    `).run(employeeId, employeeId, idCard || '');
    return result.changes;
  } catch (error) {
    console.error('markEmployeeResignedInSocialSecurity error:', error);
    return 0;
  }
}
