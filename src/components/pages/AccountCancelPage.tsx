'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCcw, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

interface AccountRequest {
  id: number;
  employeeId: number | null;
  employeeName: string;
  idCard: string;
  requestType: string;
  reason: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
  processedBy: string | null;
}

function fmt(value: string | null | undefined) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

export default function AccountCancelPage() {
  const [records, setRecords] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'待处理' | '已处理' | '已驳回' | ''>('待处理');
  const [processing, setProcessing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await fetch(`/api/employee-self-service/account-cancel${qs}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || '获取失败');
      setRecords(json.records || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取失败');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const review = async (record: AccountRequest, action: 'approve' | 'reject') => {
    const label = action === 'approve' ? '同意注销' : '驳回申请';
    if (!window.confirm(`确定${label}「${record.employeeName}」的注销申请吗？`)) return;
    setProcessing(record.id);
    try {
      const res = await fetch('/api/employee-self-service/account-cancel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || '处理失败');
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '处理失败');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            账号注销申请
          </div>
          <p className="mt-1 text-sm text-slate-500">
            员工在小程序「我的 → 注销账号」提交的申请。同意后人事档案仍保留，仅停用其小程序登录。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([['待处理', '待处理'], ['已处理', '已同意'], ['已驳回', '已驳回'], ['', '全部']] as Array<[typeof filter, string]>).map(([key, label]) => (
            <Button
              key={label}
              variant={filter === key ? 'default' : 'outline'}
              className={filter === key ? 'bg-slate-950 hover:bg-slate-800' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>员工姓名</TableHead>
              <TableHead>身份证号</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>申请原因</TableHead>
              <TableHead>申请时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">加载中...</TableCell>
              </TableRow>
            )}
            {!loading && records.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">暂无注销申请</TableCell>
              </TableRow>
            )}
            {!loading && records.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium text-slate-900">{record.employeeName}</TableCell>
                <TableCell className="text-xs text-slate-600">{record.idCard || '-'}</TableCell>
                <TableCell>{record.requestType}</TableCell>
                <TableCell className="max-w-[240px] truncate text-slate-600" title={record.reason}>{record.reason || '-'}</TableCell>
                <TableCell className="text-xs text-slate-500">{fmt(record.createdAt)}</TableCell>
                <TableCell>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    record.status === '待处理' ? 'bg-amber-50 text-amber-700'
                      : record.status === '已处理' ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}>
                    {record.status}
                  </span>
                  {record.processedAt && (
                    <div className="mt-1 text-[11px] text-slate-400">{fmt(record.processedAt)} {record.processedBy || ''}</div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {record.status === '待处理' ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={processing === record.id}
                        onClick={() => void review(record, 'approve')}
                      >
                        {processing === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        同意
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        disabled={processing === record.id}
                        onClick={() => void review(record, 'reject')}
                      >
                        <XCircle className="h-4 w-4" />
                        驳回
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">已处理</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
