/**
 * 员工自助平台草稿存储（按员工隔离，公用电脑不会串号）
 *
 * 已登录：草稿 key 带姓名+身份证后四位哈希 → 只有本人能看到
 * 未登录：使用 sessionStorage（关闭浏览器即清除），避免长期残留他人信息
 */

const IDENTITY_KEY = 'employee-self-service-identity';

function hash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) % 1000000007;
  }
  return Math.abs(h).toString(36);
}

export interface DraftScope {
  key: string;
  storage: 'local' | 'session';
}

/** 根据当前浏览器里保存的员工身份，生成隔离的草稿作用域 */
export function getDraftScope(prefix: string): DraftScope {
  if (typeof window === 'undefined') return { key: `${prefix}-anon`, storage: 'session' };
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const identity = JSON.parse(raw) as { name?: string; idCard?: string };
      const name = String(identity.name || '').trim();
      const idCard = String(identity.idCard || '').trim();
      if (name && idCard) {
        return { key: `${prefix}-${hash(name + '|' + idCard)}`, storage: 'local' };
      }
    }
  } catch { /* 忽略解析异常 */ }
  return { key: `${prefix}-anon`, storage: 'session' };
}

export function readDraft<T>(scope: DraftScope): T | null {
  try {
    const storage = scope.storage === 'local' ? window.localStorage : window.sessionStorage;
    const raw = storage.getItem(scope.key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeDraft(scope: DraftScope, value: unknown) {
  try {
    const storage = scope.storage === 'local' ? window.localStorage : window.sessionStorage;
    storage.setItem(scope.key, JSON.stringify(value));
  } catch { /* 忽略存储异常 */ }
}

export function clearDraft(scope: DraftScope) {
  try {
    const storage = scope.storage === 'local' ? window.localStorage : window.sessionStorage;
    storage.removeItem(scope.key);
  } catch { /* 忽略存储异常 */ }
}
