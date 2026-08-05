'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Send, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createDefaultSocialSecurityData,
  socialSecurityWaiverReasons,
  socialSecurityDocumentTitle,
} from '@/lib/social-security-records';
import type { SocialSecurityFormData } from '@/types/social-security';

function RequiredMark() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2">
      <label className="text-sm font-medium leading-5 text-slate-800">
        {label}
        {required && <RequiredMark />}
      </label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 text-base" />
    </div>
  );
}

export default function SocialSecurityPage() {
  const [data, setData] = useState<SocialSecurityFormData>(() => createDefaultSocialSecurityData('combined'));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const title = socialSecurityDocumentTitle(data.documentType);
  const canSubmit = useMemo(
    () => Boolean(data.name && data.idCard && data.reason),
    [data.documentType, data.idCard, data.name, data.reason],
  );

  const update = <K extends keyof SocialSecurityFormData>(field: K, value: SocialSecurityFormData[K]) => {
    setData((current) => ({ ...current, [field]: value }));
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/social-security', {
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
          <h1 className="mt-5 text-xl font-semibold">提交成功</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">后台将生成一条记录，导出文件包含两页社保声明。</p>
          <Button className="mt-6 w-full bg-blue-600 hover:bg-blue-700" onClick={() => {
            setData(createDefaultSocialSecurityData('combined'));
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
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 py-4">
        {error && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <section className="rounded-lg border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3">
            <FileText className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold">社保声明文件</h2>
          </div>
          <div className="space-y-2 p-3 text-sm leading-6 text-slate-700">
            <p>一次填写、一次提交，后台只生成一条记录。</p>
            <p className="font-medium text-slate-950">导出文件共两页：第 1 页“要求不购买社保申请书”，第 2 页“自愿放弃社保声明”。</p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3">
            <UserRound className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold">个人信息</h2>
          </div>
          <div className="space-y-4 p-3">
            <Field label="姓名" required value={data.name} onChange={(value) => update('name', value)} placeholder="请输入姓名" />
            <Field label="身份证" required value={data.idCard} onChange={(value) => update('idCard', value)} placeholder="请输入身份证号码" />
            <Field label="手机号" value={data.phone} onChange={(value) => update('phone', value)} placeholder="请输入手机号" />
            <Field label="部门" value={data.department} onChange={(value) => update('department', value)} placeholder="例如：生产部" />
            <Field label="岗位" value={data.position} onChange={(value) => update('position', value)} placeholder="例如：普工" />
            <Field label="入职日期" type="date" value={data.hireDate} onChange={(value) => update('hireDate', value)} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <h2 className="text-base font-semibold">鉴于原因<RequiredMark /></h2>
            </div>
            <div className="space-y-2 p-3">
              {socialSecurityWaiverReasons.map((reason) => (
                <Button
                  key={reason}
                  type="button"
                  variant={data.reason === reason ? 'default' : 'outline'}
                  className={data.reason === reason ? 'h-auto min-h-11 w-full justify-start whitespace-normal bg-slate-950 text-left hover:bg-slate-800' : 'h-auto min-h-11 w-full justify-start whitespace-normal text-left'}
                  onClick={() => update('reason', reason)}
                >
                  {reason}
                </Button>
              ))}
              <p className="text-xs leading-5 text-slate-500">
                导出时会在源文件“鉴于____原因”横线上填写 A 或 B，括号里的两个选项会保留显示。
              </p>
            </div>
        </section>

        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>员工只需要填写个人信息，其它固定内容由系统按模板保留。</span>
          </div>
        </div>

        <Button className="mobile-submit-button h-12 w-full bg-blue-600 text-base hover:bg-blue-700" disabled={!canSubmit || submitting} onClick={submit}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          提交申请
        </Button>
      </div>
    </main>
  );
}
