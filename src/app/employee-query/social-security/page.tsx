'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SocialSecurityWaiverForm from '@/app/social-security/page';

type Mode = 'purchase' | 'waiver';
type Stage = 'verify' | 'form';

const DRAFT_KEY = 'h5-social-security-draft';

interface StatusResult {
  success?: boolean;
  error?: string;
  employee?: { name: string; department: string; position: string };
  purchase?: { id: number; status: string; remark: string; createdAt: string } | null;
  waiver?: { id: number; status: string; createdAt: string } | null;
}

export default function PublicSocialSecurityPage() {
  const [stage, setStage] = useState<Stage>('verify');
  const [mode, setMode] = useState<Mode>('purchase');
  const [vName, setVName] = useState('');
  const [vIdCard, setVIdCard] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [status, setStatus] = useState<StatusResult | null>(null);

  const [phone, setPhone] = useState('');
  const [domicile, setDomicile] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // 从员工自助平台进入时，自动带出已登录身份并直接核验，无需重复填写
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('employee-self-service-identity');
      if (!raw) return;
      const identity = JSON.parse(raw) as { name?: string; idCard?: string };
      if (!identity.name || !identity.idCard) return;
      setVName(identity.name);
      setVIdCard(identity.idCard);
      void runCheck(identity.name, identity.idCard);
    } catch { /* 忽略身份读取异常 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, string>;
      setVName(saved.name || '');
      setVIdCard(saved.idCard || '');
      setPhone(saved.phone || '');
      setDomicile(saved.domicile || '');
      setRemarks(saved.remarks || '');
      if (saved.mode === 'waiver' || saved.mode === 'purchase') setMode(saved.mode as Mode);
    } catch { /* 忽略 */ }
  }, []);

  useEffect(() => {
    if (done) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ mode, name: vName, idCard: vIdCard, phone, domicile, remarks }));
    } catch { /* 忽略 */ }
  }, [mode, vName, vIdCard, phone, domicile, remarks, done]);

  // 统一核验逻辑（手动提交与自动带出身份都走这里）
  const runCheck = async (nameValue: string, idCardValue: string) => {
    setCheckError('');
    if (!nameValue.trim() || idCardValue.trim().length < 15) {
      setCheckError('请填写姓名和完整身份证号');
      return;
    }
    setChecking(true);
    try {
      const response = await fetch(`/api/public/social-security-status?name=${encodeURIComponent(nameValue.trim())}&idCard=${encodeURIComponent(idCardValue.trim().toUpperCase())}`);
      const result = (await response.json().catch(() => ({}))) as StatusResult;
      if (!response.ok || !result.success) {
        setCheckError(result.error || '查询失败，请稍后重试');
        return;
      }
      setStatus(result);
      if (result.purchase && result.purchase.status !== '已驳回') setMode('purchase');
      else if (result.waiver) setMode('waiver');
      setStage('form');
    } catch {
      setCheckError('网络异常，请稍后重试');
    } finally {
      setChecking(false);
    }
  };

  const verify = (event: React.FormEvent) => {
    event.preventDefault();
    void runCheck(vName, vIdCard);
  };

  const submitPurchase = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/social-security/purchase/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { employeeName: vName.trim(), idCard: vIdCard.trim().toUpperCase(), phone: phone.trim(), domicile: domicile.trim(), remarks: remarks.trim() } }),
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
            <button type="button" onClick={() => setDone(false)} className="h-12 w-full rounded-full border border-[#1677ff] text-sm font-semibold text-[#1677ff]">再次提交</button>
            <Link href="/employee-query" className="flex h-12 w-full items-center justify-center rounded-full bg-[#1677ff] text-sm font-semibold text-white">返回登录页</Link>
          </div>
        </div>
      </main>
    );
  }

  const purchaseBlocked = Boolean(status?.purchase && status.purchase.status !== '已驳回');
  const waiverBlocked = Boolean(status?.waiver);

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

      {stage === 'verify' ? (
        <form onSubmit={verify} className="space-y-4 px-4 pt-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
            先核验身份，系统会自动判断你是否已经办理过社保（已办理可直接查看状态，未办理才能提交申请）。
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">姓名 <span className="text-rose-500">*</span></span>
            <input value={vName} onChange={(event) => setVName(event.target.value)} placeholder="请输入本人姓名" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-[#1677ff]" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">身份证号 <span className="text-rose-500">*</span></span>
            <input value={vIdCard} onChange={(event) => setVIdCard(event.target.value.toUpperCase())} placeholder="请输入身份证号码" maxLength={18} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-[#1677ff]" />
          </label>

          {checkError && <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{checkError}</div>}

          <button type="submit" disabled={checking} className="h-12 w-full rounded-full bg-[#1677ff] text-base font-semibold text-white shadow-lg shadow-blue-200 disabled:opacity-60">
            {checking ? '核验中...' : '核验并继续'}
          </button>
        </form>
      ) : (
        <>
          <div className="px-4 pt-4">
            <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              <span className="font-semibold text-slate-900">{status?.employee?.name}</span>
              <span className="ml-2 text-slate-500">{status?.employee?.department || '-'} · {status?.employee?.position || '-'}</span>
            </div>

            {!(purchaseBlocked || waiverBlocked) && (
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button type="button" onClick={() => setMode('purchase')} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === 'purchase' ? 'bg-white text-[#1677ff] shadow-sm' : 'text-slate-500'}`}>购买社保</button>
              <button type="button" onClick={() => setMode('waiver')} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${mode === 'waiver' ? 'bg-white text-[#1677ff] shadow-sm' : 'text-slate-500'}`}>不购买社保协议</button>
            </div>
            )}
          </div>

          {mode === 'purchase' ? (
            purchaseBlocked ? (
              <div className="mt-4 px-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                  <div className="flex items-center gap-2 text-base font-semibold text-emerald-700">✓ 已提交购买社保申请</div>
                  <div className="mt-3 space-y-1.5 text-sm text-emerald-800">
                    <div>审核状态：<span className="font-semibold">{status?.purchase?.status}</span></div>
                    {status?.purchase?.remark ? <div>审核意见：{status.purchase.remark}</div> : null}
                    <div className="text-xs text-emerald-700/80">提交时间：{status?.purchase?.createdAt || '-'}</div>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-emerald-700/90">如信息有误或需变更，请联系人事部门处理。</p>
                </div>
              </div>
            ) : (
              <form onSubmit={submitPurchase} className="mt-4 space-y-4 px-4">
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
                <button type="submit" disabled={loading} className="h-12 w-full rounded-full bg-[#1677ff] text-base font-semibold text-white shadow-lg shadow-blue-200 disabled:opacity-60">{loading ? '提交中...' : '提交购买申请'}</button>
              </form>
            )
          ) : waiverBlocked ? (
            <div className="mt-4 px-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 text-base font-semibold text-emerald-700">✓ 已提交不购买社保协议</div>
                <div className="mt-3 space-y-1.5 text-sm text-emerald-800">
                  <div>状态：<span className="font-semibold">{status?.waiver?.status}</span></div>
                  <div className="text-xs text-emerald-700/80">提交时间：{status?.waiver?.createdAt || '-'}</div>
                </div>
                <p className="mt-4 text-xs leading-5 text-emerald-700/90">协议已提交，无需重复填写。如需变更请联系人事部门。</p>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <SocialSecurityWaiverForm />
            </div>
          )}
        </>
      )}
    </main>
  );
}
