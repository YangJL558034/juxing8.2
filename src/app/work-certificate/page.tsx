'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, IdCard, Loader2, Send, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createDefaultWorkCertificateData } from '@/lib/work-certificate-records';
import type { WorkCertificateFormData } from '@/types/work-certificate';

function RequiredMark() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2">
      <label className="text-sm font-medium leading-5 text-slate-800">
        {label}
        {required && <RequiredMark />}
      </label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 text-base" />
    </div>
  );
}

export default function WorkCertificatePage() {
  const [data, setData] = useState<WorkCertificateFormData>(() => createDefaultWorkCertificateData());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadIdentity = async () => {
      try {
      const raw = window.localStorage.getItem('employee-self-service-identity');
      if (!raw) return;
      const identity = JSON.parse(raw) as { name?: string; idCard?: string };
      if (!identity.name || !identity.idCard) return;
      const response = await fetch(`/api/employees/query?name=${encodeURIComponent(identity.name)}&idCard=${encodeURIComponent(identity.idCard)}`);
      const result = await response.json() as { employee?: { name?: string; id_card?: string; gender?: string | null } };
      setData((current) => ({ ...current, name: result.employee?.name || identity.name || current.name, idCard: result.employee?.id_card || identity.idCard || current.idCard, gender: (result.employee?.gender === '女' || result.employee?.gender === '男') ? result.employee.gender : current.gender }));
      } catch { /* ignore invalid cached identity */ }
    };
    void loadIdentity();
  }, []);

  const canSubmit = useMemo(() => data.name && data.gender && data.idCard, [data]);
  const update = <K extends keyof WorkCertificateFormData>(field: K, value: WorkCertificateFormData[K]) => {
    setData((current) => ({ ...current, [field]: value }));
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/work-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || '提交失败');
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
        <div className="mx-auto max-w-md rounded-lg border border-slate-100 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-xl font-semibold">工作证明申请提交成功</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">后台审核后会补充部门、岗位、入职日期和证明日期。</p>
          <Button className="mt-6 w-full bg-blue-600 hover:bg-blue-700" onClick={() => {
            setData(createDefaultWorkCertificateData());
            setSubmitted(false);
          }}>
            继续填写
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <p className="text-xs text-slate-500">移动端入口</p>
          <h1 className="text-lg font-semibold">工作证明申请</h1>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 py-4">
        {error && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <section className="rounded-lg border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3">
            <UserRound className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold">个人信息</h2>
          </div>
          <div className="space-y-4 p-3">
            <Field label="姓名" required value={data.name} onChange={(value) => update('name', value)} placeholder="请输入姓名" />
            <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2">
              <label className="text-sm font-medium text-slate-800">性别<RequiredMark /></label>
              <select
                value={data.gender}
                onChange={(event) => update('gender', event.target.value as WorkCertificateFormData['gender'])}
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-base outline-none focus:border-blue-500"
              >
                <option value="">请选择</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </div>
            <Field label="身份证" required value={data.idCard} onChange={(value) => update('idCard', value)} placeholder="请输入身份证号码" />
            <Field label="手机号" value={data.phone} onChange={(value) => update('phone', value)} placeholder="请输入手机号" />
          </div>
        </section>

        <section className="rounded-lg border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3">
            <FileText className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold">用途</h2>
          </div>
          <div className="space-y-4 p-3">
            <Field label="用途" value={data.purpose} onChange={(value) => update('purpose', value)} placeholder="例如 办理银行卡" />
          </div>
        </section>

        <Button className="mobile-submit-button h-12 w-full bg-blue-600 text-base hover:bg-blue-700" disabled={!canSubmit || submitting} onClick={submit}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          提交申请
        </Button>
      </div>
    </main>
  );
}
