'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, CircleHelp, Eye, EyeOff, Grid2x2, Loader2, LockKeyhole, ReceiptText, UserRound, UserRoundPlus } from 'lucide-react';

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

            <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1180px] items-center justify-center px-5 py-10 md:px-8">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden lg:block">
            <div className="flex items-center gap-4">
              <JuxingMark className="h-14 w-14" />
              <h1 className="text-[2.1rem] font-bold leading-none text-[#0b57c9]">
                <span className="text-[#1677ff]">聚星</span>数据平台
              </h1>
              <span className="mx-3 h-12 w-px bg-slate-300" />
              <div>
                <div className="text-xl font-semibold text-slate-900">人事 · 员工自助平台</div>
                <div className="mt-1 text-sm text-slate-500">工资、考勤与员工事务一站式查询与办理</div>
              </div>
            </div>

            <div className="mt-16 flex items-start gap-10">
              {[
                { icon: <CalendarCheck className="h-6 w-6" />, label: '考勤查询' },
                { icon: <ReceiptText className="h-6 w-6" />, label: '工资明细' },
                { icon: <UserRound className="h-6 w-6" />, label: '个人信息' },
                { icon: <Grid2x2 className="h-6 w-6" />, label: '更多服务' },
              ].map((item) => (
                <div key={item.label} className="flex w-20 flex-col items-center gap-3">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-blue-100 bg-white text-[#1677ff] shadow-sm">
                    {item.icon}
                  </div>
                  <span className="text-sm text-slate-600">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <section className="mx-auto w-full max-w-[430px]">
            <div className="rounded-[26px] bg-white p-7 shadow-[0_24px_60px_rgba(15,23,42,0.12)] ring-1 ring-slate-100 md:p-9">
              <div className="mb-8 text-center">
                <h2 className="text-[26px] font-bold tracking-wide text-slate-900">员工登录</h2>
                <div className="mx-auto mt-3 h-[3px] w-12 rounded-full bg-[#1677ff]" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {error && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
                )}

                <label className="flex h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 transition focus-within:border-[#1677ff] focus-within:ring-2 focus-within:ring-blue-50">
                  <UserRound className="h-5 w-5 shrink-0 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="请输入员工姓名"
                    className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                    required
                  />
                </label>

                <label className="flex h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 transition focus-within:border-[#1677ff] focus-within:ring-2 focus-within:ring-blue-50">
                  <LockKeyhole className="h-5 w-5 shrink-0 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入密码"
                    className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowPassword((value) => !value)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </label>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void loadCaptcha()}
                    title="点击刷新验证码"
                    className="flex h-14 w-[112px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-base font-semibold tracking-widest text-slate-700 transition hover:bg-slate-100"
                  >
                    {captchaLoading ? '加载中' : (captchaQuestion || '点击获取')}
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={captchaAnswer}
                    onChange={(event) => setCaptchaAnswer(event.target.value.trim())}
                    placeholder="请输入验证码"
                    maxLength={4}
                    className="h-14 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1677ff] focus:ring-2 focus:ring-blue-50"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => void loadCaptcha()}
                    className="shrink-0 whitespace-nowrap text-sm font-medium text-[#1677ff] hover:underline"
                  >
                    换一张
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading || loginSuccess}
                  className="mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-[#1677ff] text-lg font-semibold tracking-wide text-white shadow-[0_12px_26px_rgba(22,119,255,0.28)] transition hover:bg-[#0f62d6] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loginSuccess ? (
                    '登录成功'
                  ) : loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    '登 录'
                  )}
                </button>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/register'; }}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[#1677ff]/40 bg-white text-sm font-medium text-[#1677ff] transition hover:bg-blue-50"
                  >
                    <UserRoundPlus className="h-4 w-4" />
                    注册新账号
                  </button>
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/forgot-password'; }}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[#1677ff]/40 bg-white text-sm font-medium text-[#1677ff] transition hover:bg-blue-50"
                  >
                    <CircleHelp className="h-4 w-4" />
                    忘记密码
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
