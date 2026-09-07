import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

async function main() {
  process.env.CRM_DATABASE_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'juxing-session-test-')), 'crm.db');
  const { db } = await import('../src/lib/database');
  const { setEmployeeSession, getEmployeeSession, clearEmployeeSession } = await import('../src/lib/employee-session');
  const { POST: read } = await import('../src/app/api/employee-self-service/notifications/read/route');
  const { POST: avatar } = await import('../src/app/api/employee-self-service/avatar/route');
  const { GET: query } = await import('../src/app/api/employees/query/route');
  const a = Number(db.prepare("INSERT INTO employees (name, id_card, status) VALUES ('隔离测试同名', 'test-a', '在职')").run().lastInsertRowid);
  const b = Number(db.prepare("INSERT INTO employees (name, id_card, status) VALUES ('隔离测试乙', 'test-b', '在职')").run().lastInsertRowid);
  const issue = (id: number) => {
    const response = NextResponse.json({});
    setEmployeeSession(response, id);
    return `employee_session=${response.cookies.get('employee_session')!.value}`;
  };
  const firstDevice = issue(a), secondDevice = issue(a), otherEmployee = issue(b);
  const request = (cookie: string, id: number) => new NextRequest('http://localhost/api/employee-self-service/notifications/read', {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, employeeName: '隔离测试同名' }),
  });
  const notice = Number(db.prepare("INSERT INTO notifications (title, receiver_name, employee_recipient_id) VALUES ('测试', '隔离测试同名', ?)").run(a).lastInsertRowid);
  assert.equal((await read(request('', notice))).status, 401);
  assert.equal((await read(request(otherEmployee, notice))).status, 404);
  assert.equal((await read(request(firstDevice, notice))).status, 200);
  assert.equal((await read(request(firstDevice, notice))).status, 200);
  const identity = getEmployeeSession(request(secondDevice, notice));
  assert.equal(identity?.id, a);
  assert.ok(db.prepare('SELECT 1 FROM employee_notification_reads WHERE employee_id = ? AND notification_id = ?').get(identity!.id, notice));
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM employee_notification_reads WHERE notification_id = ?').get(notice) as { n: number }).n, 1);
  const form = new FormData();
  form.append('idCard', 'test-b'); // 不得使用客户端指定的其他员工身份。
  form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
  assert.equal((await avatar(new NextRequest('http://localhost/api/employee-self-service/avatar', { method: 'POST', headers: { cookie: firstDevice }, body: form }))).status, 200);
  assert.ok((db.prepare('SELECT avatar_url FROM employees WHERE id = ?').get(a) as { avatar_url: string }).avatar_url);
  assert.ok(!(db.prepare('SELECT avatar_url FROM employees WHERE id = ?').get(b) as { avatar_url: string }).avatar_url);
  const response = await query(new NextRequest(`http://localhost/api/employees/query?name=${encodeURIComponent('隔离测试同名')}&idCard=test-a`));
  const portal = await response.json();
  assert.equal(response.status, 200);
  assert.equal(portal.success, true);
  assert.equal(portal.serviceSummary.notifications.find((item: { id: number }) => item.id === notice)?.isRead, true);
  assert.ok(portal.employee.avatar_url);
  assert.ok(response.cookies.get('employee_session')?.httpOnly);
  clearEmployeeSession(request(firstDevice, notice), NextResponse.json({}));
  assert.equal((await read(request(firstDevice, notice))).status, 401);
  assert.ok(getEmployeeSession(request(secondDevice, notice)));
  console.log('PASS: 会话退出、员工身份隔离、跨设备已读、重复已读、头像身份校验');
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
