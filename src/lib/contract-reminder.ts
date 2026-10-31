import { db } from './database';
import { sendEmail } from './email';
import { chinaToday } from './china-time';

export const CONTRACT_DAYS = 22;

interface OverdueRow {
  employee_id: number;
  name: string;
  department: string | null;
  hire_date: string | null;
  days_since: number;
  overdue_days: number;
  contract_status: string | null;
}

function daysBetween(start: string, end: string) {
  const normalize = (value: string) => String(value || '').trim().replace(/\//g, '-');
  const a = Date.parse(`${normalize(start)}T00:00:00Z`);
  const b = Date.parse(`${normalize(end)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

function isSignedStatus(value: string | null | undefined) {
  const text = String(value || '');
  return text.includes('已签') || text.includes('正常');
}

/** 找出超期未登记劳动合同、且还没提醒过的员工 */
export function findOverdueContracts(today = chinaToday()): OverdueRow[] {
  const employees = db.prepare(`
    SELECT e.id AS employee_id, e.name, e.department, e.hire_date
    FROM employees e
    WHERE e.status = '在职' AND e.hire_date IS NOT NULL AND e.hire_date <> ''
  `).all() as Array<{ employee_id: number; name: string; department: string | null; hire_date: string }>;

  const rows: OverdueRow[] = [];
  for (const employee of employees) {
    const days = daysBetween(employee.hire_date, today);
    if (days <= CONTRACT_DAYS) continue;

    const purchase = db.prepare(`
      SELECT contract_status FROM social_security_purchase_records
      WHERE deleted_at IS NULL
        AND (employee_id = ? OR (id_card IS NOT NULL AND id_card <> '' AND id_card = (SELECT id_card FROM employees WHERE id = ?)))
      ORDER BY id DESC LIMIT 1
    `).get(employee.employee_id, employee.employee_id) as { contract_status: string | null } | undefined;

    if (isSignedStatus(purchase?.contract_status)) continue;

    const reminded = db.prepare('SELECT employee_id FROM labor_contract_reminders WHERE employee_id = ?')
      .get(employee.employee_id);
    if (reminded) continue;

    rows.push({
      employee_id: employee.employee_id,
      name: employee.name,
      department: employee.department,
      hire_date: employee.hire_date,
      days_since: days,
      overdue_days: days - CONTRACT_DAYS,
      contract_status: purchase?.contract_status || '',
    });
  }
  return rows;
}

function getAdminEmails(): string[] {
  const rows = db.prepare(`
    SELECT email FROM users
    WHERE role IN ('admin', 'super_admin') AND email IS NOT NULL AND email <> ''
  `).all() as Array<{ email: string }>;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const list = rows
    .map((row) => String(row.email).trim())
    .filter((email) => emailRegex.test(email) && !email.endsWith('@example.com'));
  return Array.from(new Set(list));
}

/** 每天执行一次：把超期未登记劳动合同的员工汇总成一封邮件发给管理员 */
export async function runContractReminderCheck(today = chinaToday()): Promise<{ sent: boolean; count: number; error?: string }> {
  const overdue = findOverdueContracts(today);
  if (overdue.length === 0) return { sent: false, count: 0 };

  const recipients = getAdminEmails();
  if (recipients.length === 0) {
    return { sent: false, count: overdue.length, error: '没有可用的管理员邮箱' };
  }

  const rowsHtml = overdue
    .map((row) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${row.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${row.department || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${row.hire_date}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${row.days_since} 天</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#dc2626;font-weight:600;">超期 ${row.overdue_days} 天</td>
      </tr>`)
    .join('');

  const html = `
    <div style="font-family:-apple-system,'PingFang SC',sans-serif;color:#1f2937;">
      <h2 style="color:#dc2626;">劳动合同超期提醒</h2>
      <p>以下员工入职已超过 ${CONTRACT_DAYS} 天，尚未登记劳动合同，请尽快处理：</p>
      <table style="border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f8fafc;text-align:left;">
            <th style="padding:8px 12px;">姓名</th>
            <th style="padding:8px 12px;">部门</th>
            <th style="padding:8px 12px;">入职日期</th>
            <th style="padding:8px 12px;">已入职</th>
            <th style="padding:8px 12px;">状态</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:16px;">本邮件由聚星数据平台自动发送，同一员工只会提醒一次。</p>
    </div>`;

  let anySent = false;
  let lastError: string | undefined;
  for (const to of recipients) {
    const result = await sendEmail(to, `【聚星】劳动合同超期提醒（${overdue.length} 人）`, html);
    if (result.success) anySent = true;
    else lastError = result.error;
  }

  if (!anySent) {
    return { sent: false, count: overdue.length, error: lastError || '邮件发送失败' };
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const insert = db.prepare('INSERT OR REPLACE INTO labor_contract_reminders (employee_id, sent_at, sent_to) VALUES (?, ?, ?)');
  const markMany = db.transaction(() => {
    for (const row of overdue) insert.run(row.employee_id, now, recipients.join(','));
  });
  markMany();

  return { sent: true, count: overdue.length };
}

const schedulerKey = '__laborContractReminderSchedulerStarted';

export function startContractReminderScheduler() {
  const globalState = globalThis as unknown as Record<string, boolean>;
  if (globalState[schedulerKey]) return;
  globalState[schedulerKey] = true;

  // 启动 90 秒后跑第一次，之后每 12 小时检查一次（内部按"只提醒一次"去重）
  setTimeout(() => { void runContractReminderCheck(); }, 90 * 1000);
  setInterval(() => { void runContractReminderCheck(); }, 12 * 60 * 60 * 1000);
}
