'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SocialSecurityWaiverForm from '@/app/social-security/page';

type Mode = 'purchase' | 'waiver';

const DRAFT_KEY = 'h5-social-security-draft';

export default function PublicSocialSecurityPage() {
  const [mode, setMode] = useState<Mode>('purchase');
  const [name, setName] = useState('');
  const [idCard, setIdCard] = useState('');
  const [phone, setPhone] = useState('');
  const [domicile, setDomicile] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // 草稿恢复
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, string>;
      setName(saved.name || '');
      setIdCard(saved.idCard || '');
      setPhone(saved.phone || '');
      setDomicile(saved.domicile || '');
      setRemarks(saved.remarks || '');
      if (saved.mode === 'waiver' || saved.mode === 'purchase') setMode(saved.mode as Mode);
    } catch { /* 忽略 */ }
  }, []);

  // 草稿保存
  useEffect(() => {
    if (done) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ mode, name, idCard, phone, domicile, remarks }));
    } catch { /* 忽略 */ }
  }, [mode, name, idCard, phone, domicile, remarks, done]);

  const submitPurchase = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!name.trim() || !idCard.trim()) {
      setError('请填写姓名和身份证号');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/social-security/purchase/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { employeeName: name.trim(), idCard: idCard.trim().toUpperCase(), phone: phone.trim(), domicile: domicile.trim(), remarks: remarks.trim() } }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || '提交失败，请稍后重试');
      setDone(true);
      try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* 忽略 */ }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col items-center justify-center bg-slate-50 px-6">
        <div className="w-full rounded-3xl bg-white p-7 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl">✓</div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">购买社保申请已提交</h1>
          <p className="mt-2 text-sm text-slate-500">请等待人事审核，审核结果可在「我的申请」查看。</p>
          <div className="mt-6 space-y-3">
            <button type="button" onClick={() => { setDone(false); }} className="h-12 w-full rounded-full border border-[#1677ff] text-sm font-semibold text-[#1677ff]">再次提交</button>
            <Link href="/employee-query" className="flex h-12 w-full items-center justify-center rounded-full bg-[#1677ff] text-sm font-semibold text-white">返回登录页</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[560px] bg-slate-50 pb-10">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/employee-query" className="flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <span className="text-lg leading-none">‹</span>返回
          </Link>
          <span className="text-sm font-semibold text-slate-900">社保管理</span>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode('purchase')}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === 'purchase' ? 'bg-white text-[#1677ff] shadow-sm' : 'text-slate-500'}`}
          >
            购买社保
          </button>
          <button
            type="button"
            onClick={() => setMode('waiver')}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === 'waiver' ? 'bg-white text-[#1677ff] shadow-sm' : 'text-slate-500'}`}
          >
            不购买社保协议
          </button>
        </div>
      </div>

      {mode === 'waiver' ? (
        <div className="mt-2">
          <SocialSecurityWaiverForm />
        </div>
      ) : (
        <form onSubmit={submitPurchase} className="mt-4 space-y-4 px-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
            提交后进入人事审核，审核通过后由公司统一办理参保。
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">姓名 <span className="text-rose-500">*</span></span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入本人姓名" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-[#1677ff]" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">身份证号 <span className="text-rose-500">*</span></span>
            <input value={idCard} onChange={(event) => setIdCard(event.target.value.toUpperCase())} placeholder="用于核验员工身份" maxLength={18} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-[#1677ff]" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">手机号</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} placeholder="用于联系" maxLength={11} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-[#1677ff]" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">户籍所在地</span>
            <input value={domicile} onChange={(event) => setDomicile(event.target.value)} placeholder="如：广东省东莞市" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-[#1677ff]" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">备注</span>
            <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={3} placeholder="如有特殊情况可在此说明" className="w-full rounded-xl border border-slate-200 bg-white p-4 text-[15px] outline-none focus:border-[#1677ff]" />
          </label>

          {error && <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

          <button type="submit" disabled={loading} className="h-12 w-full rounded-full bg-[#1677ff] text-base font-semibold text-white shadow-lg shadow-blue-200 disabled:opacity-60">
            {loading ? '提交中...' : '提交购买申请'}
          </button>

          <p className="text-center text-xs text-slate-400">填写内容会自动保存，误退出后可继续填写</p>
        </form>
      )}
    </main>
  );
}
