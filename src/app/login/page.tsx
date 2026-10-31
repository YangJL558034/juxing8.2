'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, UserRound } from 'lucide-react';

function safeNextPath() {
  const params = new URLSearchParams(window.location.search);
  const nextPath = params.get('next') || '/';
  return nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/';
}

function JuxingMark({ className = '' }: { className?: string }) {
  return (
    <div className={`relative grid place-items-center ${className}`} aria-hidden="true">
      <div className="absolute inset-[14%] rounded-[30%] bg-blue-600" />
      <div className="absolute left-[8%] top-[18%] h-[26%] w-[45%] -rotate-[35deg] rounded-sm bg-blue-500" />
      <div className="absolute right-[8%] top-[16%] h-[24%] w-[38%] rotate-[35deg] rounded-sm bg-sky-400" />
      <div className="absolute bottom-[14%] left-[12%] h-[24%] w-[38%] rotate-[35deg] rounded-sm bg-blue-500" />
      <div className="absolute bottom-[13%] right-[14%] h-[28%] w-[34%] -rotate-[35deg] rounded-sm bg-blue-600" />
      <div className="absolute inset-[34%] rounded-full bg-white" />
    </div>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [captchaId, setCaptchaId] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const res = await fetch('/api/auth/captcha', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setCaptchaId(data.id);
        setCaptchaQuestion(data.question);
      } else {
        setCaptchaQuestion('获取失败，点击刷新');
        setCaptchaId('');
      }
    } catch {
      setCaptchaQuestion('获取失败，点击刷新');
      setCaptchaId('');
    } finally {
      setCaptchaLoading(false);
      setCaptchaAnswer('');
    }
  }, []);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  useEffect(() => {
    const rememberedUsername = window.localStorage.getItem('rememberedUsername');
    if (rememberedUsername) {
      setUsername(rememberedUsername);
    }
  }, []);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ username, password, captchaId, captchaAnswer }),
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        window.localStorage.setItem('rememberedUsername', username);
        if (data.token) {
          window.localStorage.setItem('token', data.token);
        }

        setLoginSuccess(true);
        window.setTimeout(() => {
          window.location.href = safeNextPath();
        }, 850);
      } else {
        setError(data.error || '登录失败');
        void loadCaptcha();
        setLoading(false);
      }
    } catch (loginError) {
      console.error('Login error:', loginError);
      setError('网络错误，请稍后重试');
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#f6fbff] text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(37,99,235,0.10),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(125,211,252,0.16),transparent_28%),linear-gradient(180deg,#f9fcff_0%,#f5faff_48%,#fafdff_100%)]" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(226,246,255,0.84),transparent_68%)]" />

      {loginSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="login-success-card w-full max-w-xs rounded-2xl bg-white p-7 text-center shadow-2xl">
            <div className="login-success-check mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div className="mt-4 text-xl font-semibold text-slate-950">登录成功</div>
            <div className="mt-2 text-sm text-slate-500">正在进入系统...</div>
          </div>
        </div>
      )}

      <div className="relative z-10 flex min-h-dvh items-start justify-center px-6 pb-10 pt-[13vh] md:items-center md:px-8 md:py-12">
        <section className="w-full max-w-[28rem] md:max-w-[44rem]">
          <div className="mb-12 flex items-center justify-center gap-4 md:mb-8 md:gap-0">
            <JuxingMark className="h-20 w-20 md:hidden" />
            <h1 className="whitespace-nowrap text-[2.7rem] font-bold leading-none text-blue-700 md:text-[2rem] md:font-semibold md:text-slate-950">
              <span className="text-blue-700">聚星</span>数据平台
            </h1>
          </div>

          <form
            onSubmit={handleLogin}
            className="mx-auto w-full rounded-none bg-transparent p-0 md:max-w-[35rem] md:rounded-lg md:bg-white/92 md:px-14 md:py-12 md:shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:backdrop-blur"
          >
            {error && (
              <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 md:rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-8 md:space-y-6">
              <label className="block">
                <span className="sr-only">账号</span>
                <span className="flex h-16 items-center gap-5 rounded-full border border-slate-200/90 bg-white/86 px-7 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition focus-within:border-blue-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] md:h-14 md:rounded-md md:px-5 md:shadow-none">
                  <UserRound className="h-8 w-8 text-slate-400 md:hidden" />
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="账号 / 手机号 / 邮箱"
                    className="min-w-0 flex-1 bg-transparent text-[1.55rem] text-slate-900 outline-none placeholder:text-slate-400 md:text-lg md:placeholder:text-slate-400"
                    required
                  />
                </span>
              </label>

              <label className="block">
                <span className="sr-only">密码</span>
                <span className="flex h-16 items-center gap-5 rounded-full border border-slate-200/90 bg-white/86 px-7 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition focus-within:border-blue-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] md:h-14 md:rounded-md md:px-5 md:shadow-none">
                  <LockKeyhole className="h-8 w-8 text-slate-400 md:hidden" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="密码"
                    className="min-w-0 flex-1 bg-transparent text-[1.55rem] text-slate-900 outline-none placeholder:text-slate-400 md:text-lg"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowPassword((value) => !value)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </span>
              </label>

              {/* 验证码 */}
              <div className="block">
                <div className="flex items-center gap-3 md:gap-2">
                  <button
                    type="button"
                    onClick={() => void loadCaptcha()}
                    title="点击刷新验证码"
                    className="flex h-16 w-[9.5rem] shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-slate-50 text-[1.35rem] font-semibold tracking-widest text-slate-700 transition hover:bg-slate-100 md:h-14 md:w-[7.5rem] md:rounded-md md:text-base"
                  >
                    {captchaLoading ? '加载中' : (captchaQuestion || '点击获取')}
                  </button>
                  <span className="flex h-16 flex-1 items-center rounded-full border border-slate-200/90 bg-white/86 px-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition focus-within:border-blue-300 focus-within:bg-white md:h-14 md:rounded-md md:px-5 md:shadow-none">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={captchaAnswer}
                      onChange={(event) => setCaptchaAnswer(event.target.value.trim())}
                      placeholder="验证码"
                      maxLength={4}
                      className="min-w-0 flex-1 bg-transparent text-[1.55rem] text-slate-900 outline-none placeholder:text-slate-400 md:text-lg"
                      required
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadCaptcha()}
                    className="shrink-0 whitespace-nowrap text-[1.15rem] text-blue-600 hover:underline md:text-sm"
                  >
                    换一张
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || loginSuccess}
              className="login-action-button mt-16 flex h-[4.35rem] w-full items-center justify-center rounded-full bg-blue-600 px-5 text-[1.8rem] font-semibold text-white shadow-[0_18px_34px_rgba(37,99,235,0.22)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:mt-8 md:h-14 md:text-lg"
            >
              {loginSuccess ? (
                '登录成功'
              ) : loading ? (
                <>
                  <Loader2 className="mr-2 h-6 w-6 animate-spin md:h-5 md:w-5" />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </button>

            <div className="mt-12 flex items-center justify-between gap-4 md:mt-6">
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/forgot-password';
                }}
                className="order-1 flex h-14 min-w-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-300/95 bg-white/72 px-8 text-xl font-medium text-slate-600 transition hover:bg-white md:order-2 md:h-12 md:flex-1 md:text-base md:text-blue-700"
              >
                忘记密码
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/register';
                }}
                className="order-2 flex h-14 min-w-0 items-center justify-center whitespace-nowrap rounded-full border border-sky-700/70 bg-white/72 px-8 text-xl font-medium text-blue-700 transition hover:bg-white md:order-1 md:h-12 md:flex-1 md:text-base"
              >
                注册新账号
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
