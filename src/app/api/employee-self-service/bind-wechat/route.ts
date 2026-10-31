import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { getEmployeeByRequest } from '@/lib/employee-session';
import { code2Session } from '@/lib/wechat';

/**
 * 绑定 / 解绑当前微信
 * POST   { code }  → 把当前微信的 openid 绑到登录的这个员工账号
 * DELETE           → 解除绑定，之后只能用姓名+身份证登录
 */
export async function POST(request: NextRequest) {
  try {
    const session = getEmployeeByRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const code = String((body as Record<string, unknown>)?.code || '').trim();
    if (!code) {
      return NextResponse.json({ success: false, error: '缺少微信登录凭证' }, { status: 400 });
    }

    const wx = await code2Session(code);
    if (!wx.openid) {
      return NextResponse.json({
        success: false,
        error: wx.notConfigured ? '服务端未配置微信登录' : (wx.error || '微信绑定失败'),
      }, { status: 400 });
    }

    // 一个 openid 只绑一个员工；同时清掉该员工之前绑的其它微信
    db.prepare('UPDATE employees SET wx_openid = NULL WHERE wx_openid = ? AND id <> ?').run(wx.openid, session.id);
    db.prepare('UPDATE employees SET wx_openid = ? WHERE id = ?').run(wx.openid, session.id);

    db.prepare(`
      INSERT INTO operation_logs (user_id, username, module, action, description, created_at)
      VALUES (?, ?, 'auth', 'update', '绑定微信（一键登录）', datetime('now', '+8 hours'))
    `).run(session.id, session.name || '');

    return NextResponse.json({ success: true, message: '已绑定当前微信，下次可一键登录' });
  } catch (error) {
    console.error('Bind wechat error:', error);
    return NextResponse.json({ success: false, error: '绑定失败，请稍后重试' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = getEmployeeByRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }
    db.prepare('UPDATE employees SET wx_openid = NULL WHERE id = ?').run(session.id);
    return NextResponse.json({ success: true, message: '已解除微信绑定' });
  } catch (error) {
    console.error('Unbind wechat error:', error);
    return NextResponse.json({ success: false, error: '解绑失败' }, { status: 500 });
  }
}
