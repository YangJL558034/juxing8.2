import { NextRequest, NextResponse } from 'next/server';
import { query, db, isUsernameForbidden, validatePasswordStrength } from '@/lib/database';
import bcrypt from 'bcryptjs';

// 用户注册
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, name, email, department, registrationCode } = body;
    
    // 验证必填字段
    if (!username || !password || !name || !registrationCode) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    // 安全校验：禁用语用户名（admin 等永远不允许注册）
    if (isUsernameForbidden(username)) {
      return NextResponse.json({ error: `用户名 "${username}" 被禁止使用，请换一个` }, { status: 400 });
    }

    // 安全校验：强密码策略（替换原先"至少6位"的弱校验）
    const pwdError = validatePasswordStrength(password);
    if (pwdError) {
      return NextResponse.json({ error: '密码强度不足：' + pwdError }, { status: 400 });
    }
    
    // 验证注册码
    const codeRecord = query.getRegistrationCode.get(registrationCode) as any;
    if (!codeRecord) {
      return NextResponse.json({ error: '注册码无效或已使用' }, { status: 400 });
    }
    
    // 检查用户名是否已存在
    const existingUser = db!.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 400 });
    }
    
    // 检查邮箱是否已存在
    if (email) {
      const existingEmail = db!.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existingEmail) {
        return NextResponse.json({ error: '邮箱已被注册' }, { status: 400 });
      }
    }
    
    // 获取部门和职位信息
    const deptName = codeRecord.department_id 
      ? (db!.prepare('SELECT name FROM departments WHERE id = ?').get(codeRecord.department_id) as any)?.name || ''
      : '';
    const positionId = codeRecord.position_id || null;
    
    // 创建用户（使用注册码中指定的部门和职位）
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db!.prepare(`
      INSERT INTO users (username, password, name, role, department, email, department_id, position_id)
      VALUES (?, ?, ?, 'user', ?, ?, ?, ?)
    `).run(username, hashedPassword, name, deptName || department || '', email || '', codeRecord.department_id || null, positionId);
    
    const newUserId = result.lastInsertRowid;
    
    // 分配权限（从注册码获取权限列表）
    if (codeRecord.permissions) {
      try {
        const permissions = JSON.parse(codeRecord.permissions);
        console.log('注册码权限:', permissions, '原始:', codeRecord.permissions);
        if (Array.isArray(permissions) && permissions.length > 0) {
          // 获取权限ID列表
          const placeholders = permissions.map(() => '?').join(',');
          const permissionRecords = db!.prepare(`
            SELECT id, code FROM permissions WHERE code IN (${placeholders})
          `).all(...permissions) as { id: number; code: string }[];
          
          console.log('找到权限记录:', permissionRecords, '新用户ID:', newUserId);
          
          // 批量插入用户权限
          const insertPermission = db!.prepare('INSERT OR IGNORE INTO user_permissions (user_id, permission_id) VALUES (?, ?)');
          for (const perm of permissionRecords) {
            const result = insertPermission.run(newUserId, perm.id);
            console.log('插入权限结果:', perm.code, result);
          }
        } else {
          console.log('权限数组为空或不是数组');
        }
      } catch (e) {
        console.error('分配权限失败:', e);
      }
    } else {
      console.log('注册码没有权限字段');
    }
    
    // 标记注册码已使用
    query.markRegistrationCodeUsed.run(newUserId, codeRecord.id);
    
    return NextResponse.json({ 
      success: true, 
      message: '注册成功，请登录'
    });
  } catch (error) {
    console.error('注册失败:', error);
    return NextResponse.json({ error: '注册失败' }, { status: 500 });
  }
}
