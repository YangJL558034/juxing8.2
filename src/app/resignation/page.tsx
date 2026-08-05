'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ClipboardList, Eraser, Loader2, PenLine, Send, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createDefaultResignationData } from '@/lib/resignation-records';
import { isCompleteIdCard, normalizeIdCard } from '@/lib/identity-validation';
import type { ResignationFormData, ResignationType } from '@/types/resignation';

interface EmployeeLookupResult {
  name: string;
  idCard: string;
  employeeNo: string;
  department: string;
  position: string;
  hireDate: string;
  contractEndDate: string;
}

function RequiredMark() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
      <label className="text-sm font-medium leading-5 text-slate-800">
        {label}
        {required && <RequiredMark />}
      </label>
      <Input type={type} value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={readOnly ? 'h-11 bg-slate-50 text-base text-slate-600' : 'h-11 text-base'} />
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

export default function ResignationPage() {
  const [data, setData] = useState<ResignationFormData>(() => createDefaultResignationData());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'found' | 'missing'>('idle');
  const [lookupMessage, setLookupMessage] = useState('填写姓名和身份证号后，系统将自动带出员工入职信息。');

  const canSubmit = useMemo(() => (
    data.name
    && data.employeeNo
    && data.department
    && data.idCard
    && data.position
    && data.hireDate
    && data.applyDate
    && data.resignationDate
    && data.handoverDate
    && data.resignationType
    && data.resignationReason
    && data.applicantSignatureDataUrl
  ), [data]);

  const update = <K extends keyof ResignationFormData>(field: K, value: ResignationFormData[K]) => {
    setData((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    const name = data.name.trim();
    const idCard = normalizeIdCard(data.idCard);
    if (!name || !isCompleteIdCard(idCard)) {
      setLookupState('idle');
      setLookupMessage('填写姓名和身份证号后，系统将自动带出员工入职信息。');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLookupState('loading');
      setLookupMessage('正在查询入职信息…');
      try {
        const response = await fetch('/api/resignation/employee-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, idCard }),
          signal: controller.signal,
        });
        const result = await response.json() as { success?: boolean; employee?: EmployeeLookupResult; error?: string };
        if (!response.ok || !result.success || !result.employee) {
          setLookupState('missing');
          setLookupMessage(result.error || '未找到匹配的入职信息');
          setData((current) => ({ ...current, employeeNo: '', department: '', position: '', hireDate: '', contractEndDate: '' }));
          return;
        }
        const employee = result.employee;
        setData((current) => ({
          ...current,
          name: employee.name,
          idCard: employee.idCard,
          employeeNo: employee.employeeNo,
          department: employee.department,
          position: employee.position,
          hireDate: employee.hireDate,
          contractEndDate: employee.contractEndDate,
        }));
        setLookupState('found');
        setLookupMessage('已匹配入职记录，工号、部门、职位和入职日期已自动填写。');
      } catch (lookupError) {
        if (lookupError instanceof DOMException && lookupError.name === 'AbortError') return;
        setLookupState('missing');
        setLookupMessage('查询入职信息失败，请稍后重试');
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [data.name, data.idCard]);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/resignation', {
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
          <h1 className="mt-5 text-xl font-semibold">员工离职申请提交成功</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">请等待后台审核后打印离职申请表和离职交接清单。</p>
          <Button className="mt-6 w-full bg-blue-600 hover:bg-blue-700" onClick={() => {
            setData(createDefaultResignationData());
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
          <h1 className="text-lg font-semibold">员工离职申请表</h1>
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
            <Field label="姓名" required value={data.name} onChange={(value) => update('name', value)} />
            <Field label="身份证号" required value={data.idCard} onChange={(value) => update('idCard', normalizeIdCard(value))} />
            <div className={`rounded-md px-3 py-2 text-xs ${lookupState === 'found' ? 'bg-emerald-50 text-emerald-700' : lookupState === 'missing' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
              {lookupState === 'loading' && <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />}
              {lookupMessage}
            </div>
            <Field label="工号" required readOnly value={data.employeeNo} onChange={() => {}} />
            <Field label="部门" required readOnly value={data.department} onChange={() => {}} />
            <Field label="职位" required readOnly value={data.position} onChange={() => {}} />
            <Field label="入职日期" required readOnly type="date" value={data.hireDate} onChange={() => {}} />
            <Field label="合同到期" readOnly type="date" value={data.contractEndDate} onChange={() => {}} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3">
            <ClipboardList className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold">离职信息</h2>
          </div>
          <div className="space-y-4 p-3">
            <Field label="申请日期" required type="date" value={data.applyDate} onChange={(value) => update('applyDate', value)} />
            <Field label="离职日期" required type="date" value={data.resignationDate} onChange={(value) => update('resignationDate', value)} />
            <Field label="交接日期" required type="date" value={data.handoverDate} onChange={(value) => update('handoverDate', value)} />
            <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
              <label className="text-sm font-medium text-slate-800">离职类型<RequiredMark /></label>
              <select
                value={data.resignationType}
                onChange={(event) => update('resignationType', event.target.value as ResignationType)}
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-base outline-none focus:border-blue-500"
              >
                <option value="">请选择</option>
                <option value="辞职">辞职</option>
                <option value="辞退">辞退</option>
                <option value="自离">自离</option>
                <option value="开除">开除</option>
                <option value="其他">其他</option>
              </select>
            </div>
            {data.resignationType === '其他' && (
              <Field label="其他说明" value={data.resignationTypeOther} onChange={(value) => update('resignationTypeOther', value)} />
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800">
                离职原因
                <RequiredMark />
              </label>
              <Textarea
                value={data.resignationReason}
                onChange={(event) => update('resignationReason', event.target.value)}
                className="min-h-32 text-base"
                placeholder="请填写离职原因"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <PenLine className="h-4 w-4 text-blue-600" />
                手写签名
                <RequiredMark />
              </div>
              <SignaturePad
                value={data.applicantSignatureDataUrl}
                onChange={(value) => update('applicantSignatureDataUrl', value)}
              />
            </div>
          </div>
        </section>

        <Button className="mobile-submit-button h-12 w-full bg-blue-600 text-base hover:bg-blue-700" disabled={!canSubmit || submitting} onClick={submit}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          提交离职申请
        </Button>
      </div>
    </main>
  );
}
