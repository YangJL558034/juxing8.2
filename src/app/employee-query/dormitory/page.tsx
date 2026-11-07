'use client';

import { useState } from 'react';

interface SubmitResult {
  success?: boolean;
  error?: string;
  message?: string;
  employee?: { name: string; department: string; position: string };
}

export default function DormitoryApplyPage() {
  const [name, setName] = useState('');
  const [idCard, setIdCard] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<SubmitResult | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/public/dormitory-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, idCard, phone, expectedCheckInDate: date, reason }),
      });
      const result = (await response.json().catch(() => ({}))) as SubmitResult;
      if (!response.ok || !result.success) {
        setError(result.error || '提交失败，请稍后重试');
        return;
      }
      setDone(result);
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col items-center justify-center bg-slate-50 px-6">
        <div className="w-full rounded-3xl bg-white p-7 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl">✓</div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">提交成功</h1>
          <p className="mt-2 text-sm text-slate-500">{done.message || '住宿申请已提交，请等待人事审核'}</p>
          {done.employee && (
            <div className="mt-5 space-y-1 rounded-2xl bg-slate-50 p-4 text-left text-sm text-slate-600">
              <div>姓名：{done.employee.name}</div>
              <div>部门：{done.employee.department || '-'}</div>
              <div>岗位：{done.employee.position || '-'}</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => { setDone(null); setName(''); setIdCard(''); setPhone(''); setDate(''); setReason(''); }}
            className="mt-6 h-12 w-full rounded-full bg-blue-600 text-base font-semibold text-white"
          >
            再提交一条
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[480px] bg-slate-50 pb-10">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <h1 className="text-base font-bold text-slate-900">住宿申请</h1>
        <p className="mt-1 text-xs text-slate-500">无需登录，填写后由人事审核；仅限在职员工提交</p>
      </header>

      <form onSubmit={submit} className="space-y-4 px-4 pt-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">姓名</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="请输入本人姓名"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-blue-300"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">身份证号</span>
          <input
            value={idCard}
            onChange={(event) => setIdCard(event.target.value.toUpperCase())}
            placeholder="用于核验在职员工身份"
            maxLength={18}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-blue-300"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">手机号</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
            placeholder="用于联系安排房间"
            maxLength={11}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-blue-300"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">预计入住日期</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-blue-300"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">入住原因</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="例如：住址较远，通勤不便"
            rows={3}
            maxLength={200}
            className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-[15px] outline-none focus:border-blue-300"
          />
        </label>

        {error && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-full bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-200 disabled:opacity-60"
        >
          {loading ? '提交中...' : '提交住宿申请'}
        </button>

        <p className="pt-1 text-center text-xs text-slate-400">
          提交后可在小程序「我的申请」或本页查询审核进度
        </p>
      </form>
    </main>
  );
}
