import { randomUUID } from 'node:crypto';

interface CaptchaRecord {
  answer: number;
  expiresAt: number;
}

// 内存存储：服务重启即清空，够用且不会污染数据库
// 注意：Next.js 每个路由可能各自实例化模块，必须挂在 globalThis 上才能共享
const STORE_KEY = '__juxing_captcha_store__';
const globalStore = globalThis as unknown as { [key: string]: Map<string, CaptchaRecord> | undefined };
const store: Map<string, CaptchaRecord> = globalStore[STORE_KEY] ?? new Map<string, CaptchaRecord>();
globalStore[STORE_KEY] = store;
const TTL_MS = 5 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [id, record] of store) {
    if (record.expiresAt < now) store.delete(id);
  }
}

/** 生成算术验证码（避免图片依赖，小程序/网页都能直接显示） */
export function createCaptcha(): { id: string; question: string; expiresIn: number } {
  cleanup();
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  let answer: number;
  let question: string;
  if (a >= b) {
    answer = a - b;
    question = `${a} - ${b} = ?`;
  } else {
    answer = a + b;
    question = `${a} + ${b} = ?`;
  }
  const id = randomUUID();
  store.set(id, { answer, expiresAt: Date.now() + TTL_MS });
  return { id, question, expiresIn: Math.floor(TTL_MS / 1000) };
}

export function verifyCaptcha(id: unknown, answer: unknown): { ok: boolean; reason?: 'missing' | 'invalid' | 'expired' | 'wrong' } {
  const key = String(id || '').trim();
  if (!key) return { ok: false, reason: 'missing' };
  const record = store.get(key);
  if (!record) return { ok: false, reason: 'invalid' };
  // 一次性使用：无论对错都作废，防止暴力枚举
  store.delete(key);
  if (record.expiresAt < Date.now()) return { ok: false, reason: 'expired' };
  if (String(answer ?? '').trim() === '') return { ok: false, reason: 'missing' };
  if (Number(String(answer).trim()) !== record.answer) return { ok: false, reason: 'wrong' };
  return { ok: true };
}
