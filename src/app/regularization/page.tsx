'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, Eraser, Loader2, PenLine, Send, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createDefaultRegularizationData } from '@/lib/regularization-records';
import type { RegularizationFormData } from '@/types/regularization';

function RequiredMark() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3">
        <span className="text-blue-600">{icon}</span>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="space-y-4 p-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2">
      <label className="text-sm font-medium leading-5 text-slate-800">
        {label}
        {required && <RequiredMark />}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 min-w-0 rounded-md border-slate-200 text-base"
      />
    </div>
  );
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, rect.width, rect.height);
    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = value;
      hasDrawnRef.current = true;
    }
  };

  useEffect(() => {
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    const current = point(event);
    drawingRef.current = true;
    hasDrawnRef.current = true;
    context.beginPath();
    context.moveTo(current.x, current.y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasDrawnRef.current) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, rect.width, rect.height);
    hasDrawnRef.current = false;
    onChange('');
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-36 w-full touch-none rounded-md border border-slate-200 bg-white"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">请在上方手写签名</p>
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="h-4 w-4" />
          清除
        </Button>
      </div>
    </div>
  );
}

export default function RegularizationPage() {
  const [data, setData] = useState<RegularizationFormData>(() => createDefaultRegularizationData());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadIdentity = async () => {
      try {
        const raw = window.localStorage.getItem('employee-self-service-identity');
        if (!raw) return;
        const identity = JSON.parse(raw) as { name?: string; idCard?: string };
        if (!identity.name || !identity.idCard) return;
        const response = await fetch(`/api/employees/query?name=${encodeURIComponent(identity.name)}&idCard=${encodeURIComponent(identity.idCard)}`);
        const result = await response.json() as { employee?: { name?: string; department?: string | null; position?: string | null; hire_date?: string | null } };
        if (cancelled || !result.employee) return;
        setData((current) => ({ ...current, applicantName: result.employee?.name || identity.name || current.applicantName, department: result.employee?.department || current.department, position: result.employee?.position || current.position, hireDate: result.employee?.hire_date || current.hireDate }));
      } catch {
        // 用户仍可手动填写资料。
      }
    };
    void loadIdentity();
    return () => { cancelled = true; };
  }, []);

  const canSubmit = useMemo(() => (
    data.applicantName.trim()
    && data.department.trim()
    && data.position.trim()
    && data.hireDate
    && data.regularizationDate
    && data.workSummary.trim()
    && data.applicantSignatureDataUrl
  ), [data]);

  const update = <K extends keyof RegularizationFormData>(field: K, value: RegularizationFormData[K]) => {
    setData((current) => ({ ...current, [field]: value }));
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/regularization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error || '提交失败');
      }
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
          <h1 className="mt-5 text-xl font-semibold">转正申请提交成功</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">人事后台已经收到申请，后续由管理员审核并填写部门及相关部门意见。</p>
          <Button className="mt-6 w-full bg-blue-600 hover:bg-blue-700" onClick={() => {
            setData(createDefaultRegularizationData());
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
          <h1 className="text-lg font-semibold">员工转正申请表</h1>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <Section title="基本信息" icon={<UserRound className="h-4 w-4" />}>
          <Field label="申请人" required value={data.applicantName} onChange={(value) => update('applicantName', value)} placeholder="请输入姓名" />
          <Field label="部门" required value={data.department} onChange={(value) => update('department', value)} placeholder="请输入部门" />
          <Field label="岗位" required value={data.position} onChange={(value) => update('position', value)} placeholder="请输入岗位" />
        </Section>

        <Section title="日期信息" icon={<CalendarDays className="h-4 w-4" />}>
          <Field label="填表日期" value={data.fillDate} onChange={(value) => update('fillDate', value)} type="date" />
          <Field label="入职日期" required value={data.hireDate} onChange={(value) => update('hireDate', value)} type="date" />
          <Field label="转正日期" required value={data.regularizationDate} onChange={(value) => update('regularizationDate', value)} type="date" />
        </Section>

        <Section title="试用期工作小结" icon={<ClipboardList className="h-4 w-4" />}>
          <Textarea
            value={data.workSummary}
            onChange={(event) => update('workSummary', event.target.value)}
            placeholder="请填写试用期主要工作内容、完成情况和自我评价"
            className="min-h-40 rounded-md border-slate-200 text-base"
          />
        </Section>

        <Section title="申请人手写签名" icon={<PenLine className="h-4 w-4" />}>
          <SignaturePad
            value={data.applicantSignatureDataUrl}
            onChange={(value) => update('applicantSignatureDataUrl', value)}
          />
          <Field label="签名日期" value={data.applicantDate} onChange={(value) => update('applicantDate', value)} type="date" />
        </Section>

        <div className="pb-6">
          <Button
            className="mobile-submit-button h-12 w-full bg-blue-600 text-base hover:bg-blue-700"
            disabled={!canSubmit || submitting}
            onClick={submit}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            提交转正申请
          </Button>
        </div>
      </div>
    </main>
  );
}
