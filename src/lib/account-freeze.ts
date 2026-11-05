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

export type AccountState = 'normal' | 'frozen' | 'permanent';

export interface AccountStateInfo {
  state: AccountState;
  frozenAt: string | null;
  /** 解冻截止时间（冻结中时有值） */
  freezeUntil: string | null;
  /** 剩余可恢复天数（冻结中时 >= 0） */
  daysLeft: number;
}

/** 读取员工账号状态：正常 / 冻结中 / 永久停用 */
export function getAccountState(employeeId: number): AccountStateInfo {
  ensureAccountFreezeColumn();
  const row = db.prepare('SELECT account_frozen_at FROM employees WHERE id = ?')
    .get(employeeId) as { account_frozen_at: string | null } | undefined;
  const frozenAt = row?.account_frozen_at || null;
  if (!frozenAt) return { state: 'normal', frozenAt: null, freezeUntil: null, daysLeft: 0 };

  const start = parseChina(frozenAt);
  if (!start) return { state: 'normal', frozenAt: null, freezeUntil: null, daysLeft: 0 };

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
  if (info.state === 'frozen') {
    return `该账号已申请注销，处于冻结期（还剩 ${info.daysLeft} 天可恢复）。如需恢复请联系人事部门。`;
  }
  if (info.state === 'permanent') {
    return '该账号已注销，无法登录。如需重新使用请联系人事部门。';
  }
  return null;
}
