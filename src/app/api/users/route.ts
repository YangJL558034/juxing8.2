import { NextRequest, NextResponse } from 'next/server';
import { query, db, isUsernameForbidden, validatePasswordStrength } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

interface UserRow {
  id: number;
  role: string;
}

interface PermissionRow {
  code: string;
  name: string;
  granted: number | null;
}

interface DepartmentRow {
  id: number;
  name: string;
}

// 管理员鉴权：从 cookie 取 auth_token，必须是 admin / super_admin
async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  const session = await verifyToken(token);
  if (!session) return null;
  if (session.role !== 'admin' && session.role !== 'super_admin') return null;
  return session;
}

function resolveDepartment(department: unknown) {
  const value = String(department || '').trim();
  if (!value) return { name: '', id: null as number | null };

  const row = db.prepare(`
    SELECT id, name
    FROM departments
    WHERE CAST(id AS TEXT) = ?
       OR name = ?
    LIMIT 1
  `).get(value, value) as DepartmentRow | undefined;

  return row ? { name: row.name, id: row.id } : { name: value, id: null as number | null };
}

// 获取所有用户
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 });
    }

    const users = query.getAllUsersDetail.all() as Array<{ id: number; role: string }>;
    
    // 为每个用户获取权限
    const usersWithPermissions = users.map((user) => {
      const permissions = query.getUserPermissions.all(user.id) as PermissionRow[];
      const permissionList = permissions.map((p) => ({
        code: p.code,
        name: p.name,
        granted: p.granted === null ? (user.role === 'admin') : p.granted === 1 // 管理员默认有权限，普通用户需要有权限记录
      }));
      return { ...user, permissions: permissionList };
    });
    
    return NextResponse.json({ success: true, users: usersWithPermissions });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return NextResponse.json({ success: false, error: '获取用户列表失败' }, { status: 500 });
  }
}

// 新增用户
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { username, password, name, role, department, email, position_id, manager_id } = body;
    
    if (!username || !password || !name) {
      return NextResponse.json({ success: false, error: '用户名、密码和姓名不能为空' }, { status: 400 });
    }

    // 安全校验：禁用语用户名（admin 等永远不允许）
    if (isUsernameForbidden(username)) {
      return NextResponse.json({ success: false, error: `用户名 "${username}" 被禁止使用，请换一个` }, { status: 400 });
    }

    // 安全校验：强密码策略
    const pwdError = validatePasswordStrength(password);
    if (pwdError) {
      return NextResponse.json({ success: false, error: '密码强度不足：' + pwdError }, { status: 400 });
    }
    
    // 检查用户名是否已存在
    const existingUser = db!.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return NextResponse.json({ success: false, error: '用户名已存在' }, { status: 400 });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const posId = position_id && position_id !== '0' ? parseInt(position_id) : null;
    const mgrId = manager_id && manager_id !== '0' ? parseInt(manager_id) : null;
    const resolvedDepartment = resolveDepartment(department);
    
    const result = db!.prepare(`
      INSERT INTO users (username, password, name, role, department, department_id, email, position_id, manager_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(username, hashedPassword, name, role || 'user', resolvedDepartment.name, resolvedDepartment.id, email || '', posId, mgrId);

    // 操作日志：谁创建的 + 目标用户
    db.prepare(`INSERT INTO operation_logs (user_id, username, user_name, action, module, description, request_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))`).run(
      admin.id, admin.username, admin.name, 'create', 'user',
      `创建用户 ${username}（${name}），角色=${role || 'user'}`,
      '/api/users'
    );
    
    return NextResponse.json({ 
      success: true, 
      userId: result.lastInsertRowid,
      message: '用户创建成功'
    });
  } catch (error) {
    console.error('创建用户失败:', error);
    return NextResponse.json({ success: false, error: '创建用户失败' }, { status: 500 });
  }
}

// 更新用户
export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, role, department, email, password, position_id, manager_id, username } = body;
    
    if (!id) {
      return NextResponse.json({ success: false, error: '用户ID不能为空' }, { status: 400 });
    }

    // 如果请求里带了 username 且要改它，拦截禁用语
    if (username !== undefined && isUsernameForbidden(username)) {
      return NextResponse.json({ success: false, error: `用户名 "${username}" 被禁止使用，请换一个` }, { status: 400 });
    }

    // 如果改密码，必须符合强密码策略
    if (password) {
      const pwdError = validatePasswordStrength(password);
      if (pwdError) {
        return NextResponse.json({ success: false, error: '密码强度不足：' + pwdError }, { status: 400 });
      }
    }
    
    const posId = position_id && position_id !== '0' ? parseInt(position_id) : null;
    const mgrId = manager_id && manager_id !== '0' ? parseInt(manager_id) : null;
    const resolvedDepartment = resolveDepartment(department);
    
    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      db!.prepare('UPDATE users SET name = ?, role = ?, department = ?, department_id = ?, email = ?, password = ?, position_id = ?, manager_id = ? WHERE id = ?')
        .run(name, role, resolvedDepartment.name, resolvedDepartment.id, email || '', hashedPassword, posId, mgrId, id);
    } else {
      db!.prepare('UPDATE users SET name = ?, role = ?, department = ?, department_id = ?, email = ?, position_id = ?, manager_id = ? WHERE id = ?')
        .run(name, role, resolvedDepartment.name, resolvedDepartment.id, email || '', posId, mgrId, id);
    }
    
    return NextResponse.json({ success: true, message: '用户更新成功' });
  } catch (error) {
    console.error('更新用户失败:', error);
    return NextResponse.json({ success: false, error: '更新用户失败' }, { status: 500 });
  }
}

// 删除用户
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: '需要管理员权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ success: false, error: '用户ID不能为空' }, { status: 400 });
    }

    const userId = parseInt(id);
    
    // 不能删除管理员（管理员角色无法通过这个接口删除）
    const user = query.findUserById.get(userId) as (UserRow & { username?: string; name?: string; role?: string }) | undefined;
    if (!user) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    }
    if (user.role === 'admin' || user.role === 'super_admin') {
      return NextResponse.json({ success: false, error: '管理员账号不能通过此接口删除' }, { status: 400 });
    }

    // 事务里清掉所有引用 users.id 的外键（共 11 张表），再删用户本身
    try {
      db.exec('BEGIN TRANSACTION');

      // ── 1. 权限 ──
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);

      // ── 2. 注册码 ──
      db.prepare('UPDATE registration_codes SET created_by = NULL, used_by = NULL WHERE created_by = ? OR used_by = ?').run(userId, userId);

      // ── 3. IM 会话创建者 + 成员 ──
      db.prepare('DELETE FROM im_conversation_members WHERE user_id = ? OR added_by = ?').run(userId, userId);
      db.prepare('UPDATE im_conversations SET created_by = 0 WHERE created_by = ?').run(userId);

      // ── 4. IM 消息 ──
      db.prepare('DELETE FROM im_messages WHERE sender_id = ? OR recalled_by = ?').run(userId, userId);

      // ── 5. IM 会话已读 ──
      db.prepare('DELETE FROM im_conversation_reads WHERE user_id = ?').run(userId);

      // ── 6. 采购申请 ──
      db.prepare('UPDATE purchase_requests SET applicant_id = 0, current_approver_id = 0 WHERE applicant_id = ? OR current_approver_id = ?').run(userId, userId);

      // ── 7. 报销申请 ──
      db.prepare('UPDATE expense_claims SET applicant_id = 0, current_approver_id = 0 WHERE applicant_id = ? OR current_approver_id = ?').run(userId, userId);

      // ── 8. 审批记录 ──
      db.prepare('DELETE FROM approval_records WHERE approver_id = ?').run(userId);

      // ── 9. 站内消息 ──
      db.prepare('DELETE FROM messages WHERE user_id = ?').run(userId);

      // ── 10. 物品领用 ──
      db.prepare('UPDATE item_claim_records SET applicant_id = NULL WHERE applicant_id = ?').run(userId);

      // ── 11. 其他用户的 manager_id 可能指向此人 ──
      db.prepare('UPDATE users SET manager_id = NULL WHERE manager_id = ?').run(userId);

      // ── 12. 操作日志（保留审计记录）──
      db.prepare('UPDATE operation_logs SET user_id = NULL WHERE user_id = ?').run(userId);

      // ── 最后：删用户 ──
      query.deleteUser.run(userId);

      db.exec('COMMIT');
    } catch (txError) {
      db.exec('ROLLBACK');
      console.error('删除用户事务失败:', txError);
      return NextResponse.json({ success: false, error: '删除失败：存在无法清理的关联数据，请联系管理员' }, { status: 500 });
    }

    // 操作日志
    db.prepare(`INSERT INTO operation_logs (user_id, username, user_name, action, module, description, request_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))`).run(
      admin.id, admin.username, admin.name, 'delete', 'user',
      `删除用户 id=${id}（${user?.username || ''} ${user?.name || ''}）`,
      '/api/users'
    );
    
    return NextResponse.json({ success: true, message: '用户删除成功' });
  } catch (error) {
    console.error('删除用户失败:', error);
    return NextResponse.json({ success: false, error: '删除用户失败' }, { status: 500 });
  }
}
