import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';

const cookieName = 'employee_session';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function setEmployeeSession(response: NextResponse, employeeId: number) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM employee_sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO employee_sessions (token_hash, employee_id, expires_at) VALUES (?, ?, ?)')
    .run(digest(token), employeeId, Date.now() + 30 * 86400000);
  response.cookies.set(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 86400 });
}

export function getEmployeeSession(request: NextRequest) {
  const token = request.cookies.get(cookieName)?.value;
  if (!token) return null;
  return db.prepare(`SELECT e.id, e.name FROM employee_sessions s JOIN employees e ON e.id = s.employee_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND COALESCE(e.status, '') NOT IN ('离职', '已离职')`)
    .get(digest(token), Date.now()) as { id: number; name: string } | undefined;
}

// ===== 显式 Token 会话（小程序用，不依赖 Cookie）=====
export const EMPLOYEE_TOKEN_HEADER = 'x-employee-token';

/** 签发一个 30 天有效的员工 token，返回明文（只存哈希） */
export function issueEmployeeToken(employeeId: number): string {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM employee_sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO employee_sessions (token_hash, employee_id, expires_at) VALUES (?, ?, ?)')
    .run(digest(token), employeeId, Date.now() + 30 * 86400000);
  return token;
}

/** 从请求头解析员工身份（优先 Token，其次 Cookie） */
export function getEmployeeByRequest(request: NextRequest) {
  const headerToken = request.headers.get(EMPLOYEE_TOKEN_HEADER) || '';
  if (headerToken) {
    const found = db.prepare(`SELECT e.id, e.name FROM employee_sessions s JOIN employees e ON e.id = s.employee_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND COALESCE(e.status, '') NOT IN ('离职', '已离职')`)
      .get(digest(headerToken), Date.now()) as { id: number; name: string } | undefined;
    if (found) return found;
  }
  return getEmployeeSession(request) || null;
}

/** 吊销 Token */
export function revokeEmployeeToken(request: NextRequest) {
  const headerToken = request.headers.get(EMPLOYEE_TOKEN_HEADER) || '';
  if (headerToken) {
    db.prepare('DELETE FROM employee_sessions WHERE token_hash = ?').run(digest(headerToken));
    return true;
  }
  const cookieToken = request.cookies.get(cookieName)?.value;
  if (cookieToken) {
    db.prepare('DELETE FROM employee_sessions WHERE token_hash = ?').run(digest(cookieToken));
    return true;
  }
  return false;
}

export function clearEmployeeSession(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(cookieName)?.value;
  if (token) db.prepare('DELETE FROM employee_sessions WHERE token_hash = ?').run(digest(token));
  response.cookies.set(cookieName, '', { path: '/', maxAge: 0 });
}

// 旧通知仅在姓名唯一时兼容；新通知使用明确的员工 ID。
export const employeeNoticeAccess = `(n.employee_recipient_id = @employeeId OR
  (n.employee_recipient_id IS NULL AND n.receiver_name = @employeeName
    AND (SELECT COUNT(*) FROM employees WHERE name = @employeeName) = 1)
  OR n.receiver_name IN ('全体员工', '所有员工'))`;
