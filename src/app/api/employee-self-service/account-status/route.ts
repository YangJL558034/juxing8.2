import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { listAccountStatuses, disableAccount, enableAccount, getAccountState } from '@/lib/account-freeze';

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** 管理员：查询员工账号状态列表 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const records = listAccountStatuses({
      keyword: searchParams.get('keyword') || '',
      state: searchParams.get('state') || '',
      limit: Number(searchParams.get('limit') || 200),
    });
    return NextResponse.json({ success: true, records });
  } catch (error) {
    console.error('List account statuses error:', error);
    return NextResponse.json({ success: false, error: '获取账号状态失败' }, { status: 500 });
  }
}

/** 管理员：停用 / 启用账号 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const employeeId = Number((body as Record<string, unknown>)?.employeeId);
    const action = String((body as Record<string, unknown>)?.action || '');
    const reason = String((body as Record<string, unknown>)?.reason || '');

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }
    if (!['disable', 'enable'].includes(action)) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    if (action === 'disable') {
      disableAccount(employeeId, reason);
    } else {
      enableAccount(employeeId);
    }

    const state = getAccountState(employeeId);
    try {
      const { db } = await import('@/lib/database');
      db.prepare(`
        INSERT INTO operation_logs (username, module, action, description, created_at)
        VALUES (?, 'employee', ?, ?, datetime('now', '+8 hours'))
      `).run(
        user.name || user.username || '',
        action === 'disable' ? 'disable-account' : 'enable-account',
        `${action === 'disable' ? '停用' : '启用'}员工账号 #${employeeId}${reason ? '（原因：' + reason + '）' : ''}`,
      );
    } catch (logError) {
      console.error('account status log error:', logError);
    }

    return NextResponse.json({
      success: true,
      state: state.state,
      message: action === 'disable' ? '账号已停用，该员工无法登录' : '账号已启用，可以正常登录',
    });
  } catch (error) {
    console.error('Update account status error:', error);
    return NextResponse.json({ success: false, error: '操作失败' }, { status: 500 });
  }
}
