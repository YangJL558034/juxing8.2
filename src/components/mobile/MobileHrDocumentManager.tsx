'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type MobileHrModuleKey =
  | 'regularization'
  | 'workCertificate'
  | 'resignation'
  | 'resignationCertificate'
  | 'socialSecurity';

type RecordLike = Record<string, unknown> & {
  id: number;
  status?: string;
  data?: Record<string, unknown>;
  deletedAt?: string | null;
  restoreUntil?: string | null;
  createdAt?: string | null;
};

type ModuleConfig = {
  key: MobileHrModuleKey;
  title: string;
  desc: string;
  endpoint: string;
  accent: string;
  typeParam?: string;
  primary: (record: RecordLike) => string;
  secondary: (record: RecordLike) => string;
  dateLabel: string;
  dateValue: (record: RecordLike) => string;
  exportUrl?: (id: number) => string;
  reviewUrl?: (id: number) => string;
  restoreUrl: (id: number) => string;
  deleteUrl: (id: number) => string;
};

const configs: Record<MobileHrModuleKey, ModuleConfig> = {
  regularization: {
    key: 'regularization',
    title: '转正申请管理',
    desc: '查看、审核、导出和删除员工转正申请。',
    endpoint: '/api/regularization',
    accent: 'from-blue-600 to-cyan-500',
    primary: (record) => text(record.applicantName),
    secondary: (record) => `${text(record.department)} / ${text(record.position)}`,
    dateLabel: '转正日期',
    dateValue: (record) => date(record.regularizationDate),
    exportUrl: (id) => `/api/regularization/${id}/export`,
    reviewUrl: (id) => `/api/regularization/${id}/review`,
    restoreUrl: (id) => `/api/regularization/${id}/restore`,
    deleteUrl: (id) => `/api/regularization/${id}`,
  },
  workCertificate: {
    key: 'workCertificate',
    title: '工作证明管理',
    desc: '查看、审核、导出和删除工作证明申请。',
    endpoint: '/api/work-certificate',
    accent: 'from-sky-600 to-blue-500',
    primary: (record) => text(record.name),
    secondary: (record) => `${text(record.department)} / ${text(record.position)}`,
    dateLabel: '证明日期',
    dateValue: (record) => date(record.data?.issueDate ?? record.createdAt),
    exportUrl: (id) => `/api/work-certificate/${id}/export`,
    reviewUrl: (id) => `/api/work-certificate/${id}/review`,
    restoreUrl: (id) => `/api/work-certificate/${id}/restore`,
    deleteUrl: (id) => `/api/work-certificate/${id}`,
  },
  resignation: {
    key: 'resignation',
    title: '员工离职申请管理',
    desc: '查看、审核、导出和删除员工离职申请。',
    endpoint: '/api/resignation',
    accent: 'from-rose-600 to-orange-500',
    primary: (record) => text(record.name),
    secondary: (record) => `${text(record.department)} / ${text(record.position)}`,
    dateLabel: '离职日期',
    dateValue: (record) => date(record.resignationDate),
    exportUrl: (id) => `/api/resignation/${id}/export`,
    reviewUrl: (id) => `/api/resignation/${id}/review`,
    restoreUrl: (id) => `/api/resignation/${id}/restore`,
    deleteUrl: (id) => `/api/resignation/${id}`,
  },
  resignationCertificate: {
    key: 'resignationCertificate',
    title: '离职证明管理',
    desc: '查看离职证明申请，导出证明、删除和恢复记录。',
    endpoint: '/api/resignation-certificate',
    accent: 'from-violet-600 to-blue-500',
    primary: (record) => text(record.employeeName),
    secondary: (record) => `${text(record.department)} / ${text(record.position)}`,
    dateLabel: '离职日期',
    dateValue: (record) => date(record.leaveDate),
    exportUrl: (id) => `/api/resignation-certificate/${id}/export?type=certificate`,
    restoreUrl: (id) => `/api/resignation-certificate/${id}/restore`,
    deleteUrl: (id) => `/api/resignation-certificate/${id}`,
  },
  socialSecurity: {
    key: 'socialSecurity',
    title: '社保声明管理',
    desc: '一个入口管理两份声明；每次提交只生成一条记录，导出为两页文件。',
    endpoint: '/api/social-security',
    accent: 'from-emerald-600 to-teal-500',
    primary: (record) => text(record.name),
    secondary: (record) => `${text(record.department)} / ${text(record.position)}`,
    dateLabel: '申请日期',
    dateValue: (record) => date(record.applicationDate),
    exportUrl: (id) => `/api/social-security/${id}/export`,
    restoreUrl: (id) => `/api/social-security/${id}/restore`,
    deleteUrl: (id) => `/api/social-security/${id}`,
  },
};

const modeOptions = [
  { key: 'pending', label: '待处理' },
  { key: 'done', label: '已处理' },
  { key: 'deleted', label: '已删除' },
] as const;

type ListMode = (typeof modeOptions)[number]['key'];

function text(value: unknown) {
  const result = String(value ?? '').trim();
  return result || '-';
}

function date(value: unknown) {
  const result = text(value);
  if (result === '-') return result;
  return result.includes('T') ? result.split('T')[0] : result.slice(0, 10);
}

function dateTime(value: unknown) {
  const result = text(value);
  if (result === '-') return result;
  return result.replace('T', ' ').slice(0, 16);
}

function statusText(record: RecordLike) {
  if (record.deletedAt) return '已删除';
  return text(record.status);
}

function isPending(record: RecordLike) {
  const status = statusText(record);
  return status.includes('待') || status.includes('处理中') || status.includes('待处理');
}

function statusTone(record: RecordLike) {
  const status = statusText(record);
  if (record.deletedAt) return 'bg-slate-100 text-slate-700 ring-slate-200';
  if (status.includes('待')) return 'bg-orange-50 text-orange-700 ring-orange-200';
  if (status.includes('完成') || status.includes('审核') || status.includes('导出')) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  return 'bg-blue-50 text-blue-700 ring-blue-200';
}

function visibleDataPairs(record: RecordLike) {
  const data = record.data || {};
  return Object.entries(data)
    .filter(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.includes('signature') || normalizedKey.includes('dataurl') || normalizedKey.includes('filedata')) return false;
      return ['string', 'number', 'boolean'].includes(typeof value) && text(value) !== '-';
    })
    .slice(0, 18);
}

export default function MobileHrDocumentManager({
  moduleKey,
  onBack,
}: {
  moduleKey: MobileHrModuleKey;
  onBack: () => void;
}) {
  const config = configs[moduleKey];
  const [mode, setMode] = useState<ListMode>('pending');
  const [keyword, setKeyword] = useState('');
  const [input, setInput] = useState('');
  const [records, setRecords] = useState<RecordLike[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<RecordLike | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (mode === 'deleted') params.set('deleted', '1');
      if (config.typeParam) params.set('type', config.typeParam);

      const response = await fetch(`${config.endpoint}?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as { success?: boolean; records?: RecordLike[]; error?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.error || '获取记录失败');
      }
      setRecords(result.records || []);
    } catch (loadError) {
      setRecords([]);
      setError(loadError instanceof Error ? loadError.message : '获取记录失败');
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, config.typeParam, keyword, mode]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const visibleRecords = useMemo(() => {
    if (mode === 'deleted') return records;
    return records.filter((record) => (mode === 'pending' ? isPending(record) : !isPending(record)));
  }, [mode, records]);

  const counts = useMemo(() => {
    return {
      total: records.length,
      pending: records.filter(isPending).length,
      done: records.filter((record) => !isPending(record)).length,
    };
  }, [records]);

  const openDetail = (record: RecordLike) => {
    setSelectedRecord(record);
    setDetailOpen(true);
  };

  const reviewRecord = async (record: RecordLike) => {
    if (!config.reviewUrl) return;
    if (!confirm(`确定审核通过 ${config.primary(record)} 吗？`)) return;

    try {
      const response = await fetch(config.reviewUrl(record.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: record.data || {} }),
      });
      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || '审核失败');
      setDetailOpen(false);
      setMode('done');
      await loadRecords();
    } catch (reviewError) {
      alert(reviewError instanceof Error ? reviewError.message : '审核失败');
    }
  };

  const deleteRecord = async (record: RecordLike) => {
    if (!confirm(`确定删除 ${config.primary(record)} 吗？删除后一周内可恢复。`)) return;

    try {
      const response = await fetch(config.deleteUrl(record.id), { method: 'DELETE' });
      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || '删除失败');
      setDetailOpen(false);
      await loadRecords();
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : '删除失败');
    }
  };

  const restoreRecord = async (record: RecordLike) => {
    try {
      const response = await fetch(config.restoreUrl(record.id), { method: 'PATCH' });
      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || '恢复失败');
      setDetailOpen(false);
      await loadRecords();
    } catch (restoreError) {
      alert(restoreError instanceof Error ? restoreError.message : '恢复失败');
    }
  };

  const exportRecord = (record: RecordLike) => {
    if (!config.exportUrl) return;
    window.open(config.exportUrl(record.id), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-3">
      <section className="mobile-ios-glass rounded-[24px] p-4 text-slate-950">
        <div className="flex items-start gap-3">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-9 w-9 shrink-0 rounded-2xl border border-white/70 bg-white/[0.58] text-blue-700 shadow-sm backdrop-blur-xl hover:bg-white/75"
            onClick={onBack}
            aria-label="返回人事管理"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold">{config.title}</h1>
            <p className="mt-1 text-xs leading-5 text-slate-600">{config.desc}</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-9 w-9 shrink-0 rounded-2xl border border-white/70 bg-white/[0.58] text-blue-700 shadow-sm backdrop-blur-xl hover:bg-white/75"
            onClick={() => void loadRecords()}
            disabled={loading}
          >
            <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="mobile-ios-tile rounded-2xl p-2.5">
            <div className="text-lg font-bold">{counts.total}</div>
            <div className="text-[11px] text-slate-500">总数</div>
          </div>
          <div className="mobile-ios-tile rounded-2xl p-2.5">
            <div className="text-lg font-bold">{counts.pending}</div>
            <div className="text-[11px] text-slate-500">待处理</div>
          </div>
          <div className="mobile-ios-tile rounded-2xl p-2.5">
            <div className="text-lg font-bold">{counts.done}</div>
            <div className="text-[11px] text-slate-500">已处理</div>
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-white/70 bg-white/90 p-2.5 shadow-sm backdrop-blur">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setKeyword(input.trim());
              }}
              placeholder="搜索姓名、部门、身份证"
              className="h-10 rounded-2xl bg-slate-50 pl-9 text-sm"
            />
          </div>
          <Button className="h-10 rounded-2xl bg-blue-600 px-4 text-sm" onClick={() => setKeyword(input.trim())}>
            查询
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {modeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key)}
              className={cn(
                'rounded-2xl px-2 py-2 text-xs font-semibold transition',
                mode === option.key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-950">记录列表</h2>
          <span className="text-xs text-slate-500">{visibleRecords.length} 条</span>
        </div>

        {loading && (
          <div className="rounded-[22px] border border-white/70 bg-white/90 p-6 text-center text-sm text-slate-500 shadow-sm">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-blue-600" />
            正在加载
          </div>
        )}

        {!loading && visibleRecords.length === 0 && (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-500">
            暂无{modeOptions.find((option) => option.key === mode)?.label}记录
          </div>
        )}

        {!loading && visibleRecords.map((record) => (
          <article key={record.id} className="rounded-[22px] border border-white/75 bg-white/[0.92] p-3 shadow-sm backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-slate-950">{config.primary(record)}</h3>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', statusTone(record))}>
                    {statusText(record)}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{config.secondary(record)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl bg-slate-50 p-2.5">
                <div className="text-slate-400">{config.dateLabel}</div>
                <div className="mt-1 font-medium text-slate-900">{config.dateValue(record)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-2.5">
                <div className="text-slate-400">提交时间</div>
                <div className="mt-1 font-medium text-slate-900">{dateTime(record.createdAt)}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={() => openDetail(record)}>
                <Eye className="mr-1 h-3.5 w-3.5" />
                查看
              </Button>
              {mode === 'pending' && config.reviewUrl && (
                <Button size="sm" className="h-8 rounded-full bg-blue-600 px-3 text-xs" onClick={() => void reviewRecord(record)}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  审核
                </Button>
              )}
              {mode !== 'deleted' && config.exportUrl && (
                <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={() => exportRecord(record)}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  导出
                </Button>
              )}
              {mode === 'deleted' ? (
                <Button size="sm" variant="outline" className="h-8 rounded-full border-emerald-200 px-3 text-xs text-emerald-700" onClick={() => void restoreRecord(record)}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  恢复
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8 rounded-full border-red-200 px-3 text-xs text-red-600" onClick={() => void deleteRecord(record)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  删除
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-[26px] border-white/70 bg-white/95 p-0 backdrop-blur-2xl">
          <SheetHeader className="border-b border-slate-100 px-4 py-3 text-left">
            <SheetTitle className="text-base">{selectedRecord ? config.primary(selectedRecord) : '记录详情'}</SheetTitle>
            <SheetDescription>{selectedRecord ? config.secondary(selectedRecord) : ''}</SheetDescription>
          </SheetHeader>

          {selectedRecord && (
            <div className="max-h-[calc(82dvh-8rem)] overflow-y-auto px-4 py-3">
              <div className="space-y-2 rounded-[22px] bg-slate-50 p-3 text-sm">
                {[
                  ['状态', statusText(selectedRecord)],
                  [config.dateLabel, config.dateValue(selectedRecord)],
                  ['提交时间', dateTime(selectedRecord.createdAt)],
                  ['恢复截止', dateTime(selectedRecord.restoreUntil)],
                ].filter(([, value]) => value !== '-').map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-white pb-2 last:border-b-0 last:pb-0">
                    <span className="shrink-0 text-slate-500">{label}</span>
                    <span className="min-w-0 break-all text-right font-medium text-slate-900">{value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-2 rounded-[22px] bg-white text-sm">
                {visibleDataPairs(selectedRecord).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                    <span className="shrink-0 text-slate-500">{label}</span>
                    <span className="min-w-0 break-all text-right font-medium text-slate-900">{text(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
