import { NextRequest, NextResponse } from 'next/server';
import { login, generateToken, setAuthCookie } from '@/lib/auth';
import { logOperationServer } from '@/lib/database';
import { verifyCaptcha } from '@/lib/captcha';

// 登录失败限流：同一 IP + 账号，15 分钟内失败 5 次锁定 15 分钟
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const attempts = new Map<string, { count: number; firstAt: number; lockedUntil?: number }>();

function clientIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const { username, password, captchaId, captchaAnswer } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: '请输入用户名和密码' },
        { status: 400 }
      );
    }

    // 验证码校验（一次性，校验后立即作废）
    const captcha = verifyCaptcha(captchaId, captchaAnswer);
    if (!captcha.ok) {
      const messages: Record<string, string> = {
        missing: '请输入验证码',
        invalid: '验证码已失效，请点击刷新',
        expired: '验证码已过期，请点击刷新',
        wrong: '验证码错误',
      };
      return NextResponse.json(
        { success: false, error: messages[captcha.reason || 'wrong'] || '验证码错误' },
        { status: 400 }
      );
    }

    const key = `${clientIp(request)}|${String(username).trim().toLowerCase()}`;
    const now = Date.now();
    const record = attempts.get(key);

    if (record?.lockedUntil && record.lockedUntil > now) {
      const minutes = Math.ceil((record.lockedUntil - now) / 60000);
      return NextResponse.json(
        { success: false, error: `登录失败次数过多，请 ${minutes} 分钟后再试` },
        { status: 429 }
      );
    }

    const result = await login(username, password);

    if (!result.success) {
      const current = record && now - record.firstAt < WINDOW_MS
        ? record
        : { count: 0, firstAt: now };
      current.count += 1;
      if (current.count >= MAX_FAILS) {
        current.lockedUntil = now + WINDOW_MS;
        current.count = 0;
        current.firstAt = now;
      }
      attempts.set(key, current);

      // 记录登录失败日志
      logOperationServer({
        userName: username,
        module: 'auth',
        action: 'login',
        details: { success: false, error: result.error },
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
        userAgent: request.headers.get('user-agent') || null,
      });

      return NextResponse.json(
        {
          success: false,
          error: current.lockedUntil
            ? '登录失败次数过多，账号已临时锁定 15 分钟'
            : `${result.error}（还剩 ${Math.max(0, MAX_FAILS - current.count)} 次尝试机会）`,
        },
        { status: 401 }
      );
    }

    attempts.delete(key);

    const token = await generateToken(result.user!);

    // 记录登录成功日志
    logOperationServer({
      userId: result.user!.id,
      userName: result.user!.name || result.user!.username,
      module: 'auth',
      action: 'login',
      details: { success: true },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    });
    
    const response = NextResponse.json({ 
      success: true, 
      user: result.user,
      token: token
    });
    
    response.headers.set('Set-Cookie', setAuthCookie(token));
    
    return response;
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
