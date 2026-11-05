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
  accountState?: 'normal' | 'frozen' | 'permanent';
  freezeDaysLeft?: number;
  freezeUntil?: string | null;
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
  const [filter, setFilter] = useState<'待处理' | '已处理' | '已恢复' | '已驳回' | ''>('待处理');
  const [pageTab, setPageTab] = useState<'requests' | 'accounts'>('requests');
  const [accountRows, setAccountRows] = useState<Array<{ id: number; name: string; department: string; employmentStatus: string; accountState: string; daysLeft: number; disabledReason: string }>>([]);
  const [accountKeyword, setAccountKeyword] = useState('');
  const [accountLocation, setAccountLocation] = useState<'all' | 'office' | 'workshop'>('all');
  const [accountStateFilter, setAccountStateFilter] = useState<'all' | 'normal' | 'disabled' | 'frozen' | 'resigned'>('all');
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountBusy, setAccountBusy] = useState(0);
  const [disableTarget, setDisableTarget] = useState<{ id: number; name: string } | null>(null);
  const [disableReason, setDisableReason] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);
  // 用页面内确认框，替代可能被浏览器拦截的 window.confirm
  const [pending, setPending] = useState<{ record: AccountRequest; action: 'approve' | 'reject' | 'restore' } | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

  const review = async (record: AccountRequest, action: 'approve' | 'reject' | 'restore') => {
    setPending({ record, action });
  };

  const doReview = async () => {
    if (!pending) return;
    const { record, action } = pending;
    setPending(null);
    setProcessing(record.id);
    setNotice(null);
    try {
      const res = await fetch('/api/employee-self-service/account-cancel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || '处理失败');
      setNotice({
        type: 'ok',
        text: `已${action === 'approve' ? '同意' : '驳回'}「${record.employeeName}」的注销申请`,
      });
      await load();
      // 同意后自动切到「冻结中」页签，管理员能立刻看到「恢复账号」按钮
      if (action === 'approve' && filter === '待处理') setFilter('已处理');
    } catch (e) {
      setNotice({ type: 'err', text: e instanceof Error ? e.message : '处理失败' });
    } finally {
      setProcessing(null);
    }
  };

  const loadAccounts = useCallback(async () => {
    setAccountLoading(true);
    try {
      const params = new URLSearchParams();
      if (accountKeyword) params.set('keyword', accountKeyword);
      if (accountLocation !== 'all') params.set('location', accountLocation);
      if (accountStateFilter !== 'all') params.set('state', accountStateFilter);
      const qs2 = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/employee-self-service/account-status${qs2}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || '加载失败');
      setAccountRows(json.records || []);
    } catch (e) {
      setNotice({ type: 'err', text: e instanceof Error ? e.message : '加载失败' });
    } finally {
      setAccountLoading(false);
    }
  }, [accountKeyword, accountLocation, accountStateFilter]);

  useEffect(() => {
    if (pageTab === 'accounts') void loadAccounts();
  }, [pageTab, loadAccounts]);

  const toggleAccount = async (row: { id: number; name: string; accountState: string }, action: 'disable' | 'enable', reason = '') => {
    setAccountBusy(row.id);
    setNotice(null);
    try {
      const res = await fetch('/api/employee-self-service/account-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: row.id, action, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || '操作失败');
      setNotice({ type: 'ok', text: json.message || '操作成功' });
      await loadAccounts();
    } catch (e) {
      setNotice({ type: 'err', text: e instanceof Error ? e.message : '操作失败' });
    } finally {
      setAccountBusy(0);
      setDisableTarget(null);
      setDisableReason('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1">
        <button
          type="button"
          onClick={() => setPageTab('requests')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${pageTab === 'requests' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
        >
          注销申请
        </button>
        <button
          type="button"
          onClick={() => setPageTab('accounts')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${pageTab === 'accounts' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
        >
          账号停用管理
        </button>
      </div>

      <div className={pageTab === 'requests' ? '' : 'hidden'}>
      <div className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            员工自助平台账号管理
          </div>
          <p className="mt-1 text-sm text-slate-500">
            员工在小程序「我的 → 注销账号」提交的申请。同意后人事档案仍保留，仅停用其小程序登录。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([['待处理', '待处理'], ['已处理', '冻结中'], ['已恢复', '已恢复'], ['已驳回', '已驳回'], ['', '全部']] as Array<[typeof filter, string]>).map(([key, label]) => (
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

      {notice && (
        <div
          className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
            notice.type === 'ok'
              ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
              : 'border border-red-100 bg-red-50 text-red-700'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={() => setNotice(null)}>
            关闭
          </button>
        </div>
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
                  {record.status === '已处理' && record.accountState === 'frozen' && (
                    <div className="mt-1 text-[11px] text-amber-600">
                      冻结中 · 还剩 {record.freezeDaysLeft ?? 0} 天可恢复
                    </div>
                  )}
                  {record.status === '已处理' && record.accountState === 'permanent' && (
                    <div className="mt-1 text-[11px] text-red-600">已永久停用</div>
                  )}
                  {record.status === '已恢复' && (
                    <div className="mt-1 text-[11px] text-emerald-600">账号已恢复，可正常登录</div>
                  )}
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
                  ) : record.status === '已处理' && record.accountState === 'frozen' ? (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={processing === record.id}
                      onClick={() => void review(record, 'restore')}
                    >
                      {processing === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      恢复账号
                    </Button>
                  ) : record.status === '已处理' ? (
                    <span className="text-xs text-slate-400">已永久停用</span>
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

      {/* 账号停用管理 */}
      <div className={pageTab === 'accounts' ? 'space-y-3' : 'hidden'}>
        <div className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              账号停用管理
            </div>
            <p className="mt-1 text-sm text-slate-500">停用后该员工立即无法登录（人事档案不变），可随时重新启用。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={accountKeyword}
              onChange={(event) => setAccountKeyword(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void loadAccounts(); }}
              placeholder="搜索姓名/部门/手机号"
              className="h-9 w-52 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"
            />
            <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1">
              {([['all', '全部'], ['office', '管理部'], ['workshop', '车间']] as Array<['all' | 'office' | 'workshop', string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAccountLocation(key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${accountLocation === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1">
              {([['all', '全部'], ['normal', '正常'], ['frozen', '冻结中'], ['resigned', '已离职']] as Array<['all' | 'normal' | 'disabled' | 'frozen' | 'resigned', string]>).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAccountStateFilter(key)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${accountStateFilter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => void loadAccounts()} disabled={accountLoading}>
              {accountLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              刷新
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>员工姓名</TableHead>
                <TableHead>部门</TableHead>
                <TableHead>人事状态</TableHead>
                <TableHead>账号状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">加载中...</TableCell>
                </TableRow>
              )}
              {!accountLoading && accountRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">没有匹配的员工</TableCell>
                </TableRow>
              )}
              {!accountLoading && accountRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                  <TableCell className="text-slate-600">{row.department || '-'}</TableCell>
                  <TableCell className="text-slate-600">{row.employmentStatus || '-'}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      row.accountState === 'disabled' || row.accountState === 'resigned' ? 'bg-rose-50 text-rose-700'
                        : row.accountState === 'frozen' ? 'bg-amber-50 text-amber-700'
                          : row.accountState === 'permanent' ? 'bg-slate-200 text-slate-600'
                            : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {row.accountState === 'resigned' ? '已停用（离职）'
                        : row.accountState === 'disabled' ? '已停用'
                        : row.accountState === 'frozen' ? `冻结中·剩 ${row.daysLeft} 天`
                          : row.accountState === 'permanent' ? '已注销' : '正常'}
                    </span>
                    {row.accountState === 'disabled' && row.disabledReason && (
                      <div className="mt-1 text-[11px] text-rose-500">原因：{row.disabledReason}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.accountState === 'resigned' ? (
                      <span className="text-xs text-slate-400">已离职，无需停用</span>
                    ) : row.accountState === 'disabled' ? (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={accountBusy === row.id}
                        onClick={() => void toggleAccount(row, 'enable')}
                      >
                        {accountBusy === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        启用账号
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-200 text-rose-600 hover:bg-rose-50"
                        disabled={accountBusy === row.id || row.accountState === 'permanent'}
                        onClick={() => { setDisableTarget({ id: row.id, name: row.name }); setDisableReason(''); }}
                      >
                        <XCircle className="h-4 w-4" />
                        停用账号
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 停用确认弹窗 */}
      {disableTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">停用「{disableTarget.name}」的账号</div>
            <p className="mt-2 text-sm text-slate-600">停用后该员工立即无法登录，可随时重新启用。</p>
            <input
              value={disableReason}
              onChange={(event) => setDisableReason(event.target.value)}
              placeholder="请填写停用原因（必填）"
              className="mt-3 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDisableTarget(null)}>取消</Button>
              <Button className="bg-rose-600 hover:bg-rose-700" disabled={!disableReason.trim()} onClick={() => void toggleAccount({ id: disableTarget.id, name: disableTarget.name, accountState: 'normal' }, 'disable', disableReason)}>
                确认停用
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* 处理确认弹窗 */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">
              {pending.action === 'approve' ? '同意注销申请' : '驳回注销申请'}
            </div>
            <div className="mt-2 text-sm leading-relaxed text-slate-600">
              确定{pending.action === 'approve' ? '同意' : '驳回'}「
              <span className="font-medium text-slate-900">{pending.record.employeeName}</span>
              」的账号注销申请吗？
              {pending.action === 'approve' && (
                <div className="mt-2 text-xs text-amber-600">
                  同意后人事档案仍会保留，仅标记为已处理。
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPending(null)}>
                取消
              </Button>
              <Button
                className={pending.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
                onClick={() => void doReview()}
              >
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
