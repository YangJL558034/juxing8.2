import { db } from '@/lib/database';

/** 注销后冻结 30 天，期间可恢复；超期永久停用 */
export const ACCOUNT_FREEZE_DAYS = 30;

let columnReady = false;

export function ensureAccountFreezeColumn() {
  try {
    const columns = (db.prepare('PRAGMA table_info(employees)').all() as Array<{ name: string }>).map((c) => c.name);
    if (!columns.includes('account_frozen_at')) {
      db.exec('ALTER TABLE employees ADD COLUMN account_frozen_at TEXT');
    }
    if (!columns.includes('account_disabled')) {
      db.exec('ALTER TABLE employees ADD COLUMN account_disabled INTEGER DEFAULT 0');
    }
    if (!columns.includes('account_disabled_reason')) {
      db.exec('ALTER TABLE employees ADD COLUMN account_disabled_reason TEXT');
    }
    if (!columns.includes('account_disabled_at')) {
      db.exec('ALTER TABLE employees ADD COLUMN account_disabled_at TEXT');
    }
    columnReady = true;
  } catch (error) {
    console.error('ensureAccountFreezeColumn error:', error);
  }
}

function chinaNow(): Date {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

function parseChina(text: string | null | undefined): Date | null {
  const value = String(text || '').trim();
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 19).replace(' ', 'T')}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type AccountState = 'normal' | 'disabled' | 'frozen' | 'permanent';

export interface AccountStateInfo {
  state: AccountState;
  frozenAt: string | null;
  /** 解冻截止时间（冻结中时有值） */
  freezeUntil: string | null;
  /** 剩余可恢复天数（冻结中时 >= 0） */
  daysLeft: number;
  /** 管理员停用原因（state=disabled 时有值） */
  disabledReason?: string;
}

/** 读取员工账号状态：正常 / 冻结中 / 永久停用 */
export function getAccountState(employeeId: number): AccountStateInfo {
  ensureAccountFreezeColumn();
  const row = db.prepare('SELECT account_frozen_at, account_disabled, account_disabled_reason FROM employees WHERE id = ?')
    .get(employeeId) as { account_frozen_at: string | null; account_disabled: number | null; account_disabled_reason: string | null } | undefined;
  if (Number(row?.account_disabled || 0) === 1) {
    return { state: 'disabled', frozenAt: null, freezeUntil: null, daysLeft: 0, disabledReason: row?.account_disabled_reason || '' };
  }
  const frozenAt = row?.account_frozen_at || null;
  if (!frozenAt) return { state: 'normal', frozenAt: null, freezeUntil: null, daysLeft: 0, disabledReason: '' };

  const start = parseChina(frozenAt);
  if (!start) return { state: 'normal', frozenAt: null, freezeUntil: null, daysLeft: 0, disabledReason: '' };

  const until = new Date(start.getTime() + ACCOUNT_FREEZE_DAYS * 86400000);
  const now = chinaNow();
  const daysLeft = Math.ceil((until.getTime() - now.getTime()) / 86400000);
  return {
    state: daysLeft > 0 ? 'frozen' : 'permanent',
    frozenAt,
    freezeUntil: until.toISOString().slice(0, 10),
    daysLeft: Math.max(0, daysLeft),
  };
}

/** 冻结账号：置冻结时间、吊销所有会话、解绑微信 */
export function freezeAccount(employeeId: number) {
  ensureAccountFreezeColumn();
  db.prepare(`
    UPDATE employees
    SET account_frozen_at = datetime('now', '+8 hours'),
        wx_openid = NULL
    WHERE id = ?
  `).run(employeeId);
  try {
    db.prepare('DELETE FROM employee_sessions WHERE employee_id = ?').run(employeeId);
  } catch (error) {
    console.error('freezeAccount revoke sessions error:', error);
  }
}

/** 恢复账号：清空冻结时间 */
export function unfreezeAccount(employeeId: number): boolean {
  ensureAccountFreezeColumn();
  const info = getAccountState(employeeId);
  if (info.state === 'permanent') return false;
  db.prepare('UPDATE employees SET account_frozen_at = NULL WHERE id = ?').run(employeeId);
  return true;
}

/** 登录拦截提示文案 */
export function accountBlockMessage(info: AccountStateInfo): string | null {
  if (info.state === 'disabled') {
    const reason = String(info.disabledReason || '').trim();
    return reason
      ? `该账号已被管理员停用（原因：${reason}），如需恢复请联系人事部门。`
      : '该账号已被管理员停用，如需恢复请联系人事部门。';
  }
  if (info.state === 'frozen') {
    return `该账号已申请注销，处于冻结期（还剩 ${info.daysLeft} 天可恢复）。如需恢复请联系人事部门。`;
  }
  if (info.state === 'permanent') {
    return '该账号已注销，无法登录。如需重新使用请联系人事部门。';
  }
  return null;
}

/** 管理员停用账号：永久生效，直到手动启用 */
export function disableAccount(employeeId: number, reason: string) {
  ensureAccountFreezeColumn();
  db.prepare(`
    UPDATE employees
    SET account_disabled = 1,
        account_disabled_reason = ?,
        account_disabled_at = datetime('now', '+8 hours'),
        wx_openid = NULL
    WHERE id = ?
  `).run(String(reason || '').trim(), employeeId);
  try {
    db.prepare('DELETE FROM employee_sessions WHERE employee_id = ?').run(employeeId);
  } catch (error) {
    console.error('disableAccount revoke sessions error:', error);
  }
  notifyDisabled(employeeId, reason);
}

/** 停用后给员工发一条站内通知，员工在「通知」里能看到原因 */
function notifyDisabled(employeeId: number, reason: string) {
  try {
    const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(employeeId) as { name: string } | undefined;
    if (!emp) return;
    db.exec(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, content TEXT, sender_id INTEGER, sender_name TEXT,
      receiver_id INTEGER, receiver_name TEXT, type TEXT,
      is_read INTEGER DEFAULT 0, read_at DATETIME,
      email_sent INTEGER DEFAULT 0, email_error TEXT,
      attachment_file TEXT, attachment_file_name TEXT,
      created_at TEXT, employee_recipient_id INTEGER
    )`);
    db.prepare(`
      INSERT INTO notifications (title, content, sender_name, receiver_name, type, created_at, employee_recipient_id)
      VALUES (?, ?, ?, ?, 'system', datetime('now', '+8 hours'), ?)
    `).run(
      '账号已被停用',
      `您的员工账号已被管理员停用${reason ? '，原因：' + reason : ''}。如需恢复请联系人事部门。`,
      '人事部门',
      emp.name,
      employeeId,
    );
  } catch (error) {
    console.error('notifyDisabled error:', error);
  }
}

/** 管理员启用账号：清除停用与冻结标记 */
export function enableAccount(employeeId: number) {
  ensureAccountFreezeColumn();
  db.prepare(`
    UPDATE employees
    SET account_disabled = 0,
        account_disabled_reason = NULL,
        account_disabled_at = NULL,
        account_frozen_at = NULL
    WHERE id = ?
  `).run(employeeId);
}

/** 列出员工账号状态（供后台管理） */
export function listAccountStatuses(params: { keyword?: string; state?: string; limit?: number; location?: string }) {
  ensureAccountFreezeColumn();
  const keyword = String(params.keyword || '').trim();
  const where: string[] = [];
  const args: unknown[] = [];
  if (keyword) {
    where.push('(e.name LIKE ? OR e.department LIKE ? OR e.phone LIKE ?)');
    args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const sql = `
    SELECT e.id, e.name, e.department, e.position, e.status,
           e.account_frozen_at, e.account_disabled, e.account_disabled_reason, e.account_disabled_at
    FROM employees e
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.account_disabled DESC, e.account_frozen_at DESC, e.name
    LIMIT ?
  `;
  args.push(Math.min(Number(params.limit) || 200, 500));
  const rows = db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const info = getAccountState(Number(row.id));
    return {
      id: Number(row.id),
      name: String(row.name || ''),
      department: String(row.department || ''),
      position: String(row.position || ''),
      employmentStatus: String(row.status || ''),
      accountState: info.state,
      daysLeft: info.daysLeft,
      freezeUntil: info.freezeUntil,
      disabledReason: info.disabledReason || '',
      disabledAt: row.account_disabled_at ? String(row.account_disabled_at) : null,
      frozenAt: info.frozenAt,
    };
  }).filter((row) => {
    if (params.state && row.accountState !== params.state) return false;
    if (params.location) {
      const dept = String(row.department || '');
      const isWorkshop = /生产|车间|产线|流水/.test(dept) || !dept.trim();
      if (params.location === 'workshop' && !isWorkshop) return false;
      if (params.location === 'office' && isWorkshop) return false;
    }
    return true;
  });
}