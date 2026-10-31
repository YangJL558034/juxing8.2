'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, RefreshCcw, Mail, FileText } from 'lucide-react';

interface ContractRecord {
  employeeId: number;
  name: string;
  idCard: string;
  department: string;
  position: string;
  category: 'management' | 'production';
  hireDate: string;
  daysSinceHire: number | null;
  daysLeft: number | null;
  overdue: boolean;
  signed: boolean;
  expired: boolean;
  canEdit: boolean;
  pendingRenewal: boolean;
  expireAt: string;
  renewal: {
    id: number;
    status: string;
    oldStartDate: string;
    oldEndDate: string;
    newStartDate: string;
    newEndDate: string;
    appliedBy: string;
    appliedAt: string;
    reviewerName: string;
    reviewedAt: string;
    remark: string;
  } | null;
  contractStatus: string;
  contractStartDate: string;
  contractEndDate: string;
  contractTermYears: string;
}

const CONTRACT_DAYS = 22;

export default function LaborContractSection() {
  const [records, setRecords] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [category, setCategory] = useState<'all' | 'management' | 'production'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<ContractRecord | null>(null);
  const [status, setStatus] = useState<'已签订' | '未签订'>('已签订');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [termYears, setTermYears] = useState('');
  const [saving, setSaving] = useState(false);
  const [reminding, setReminding] = useState(false);
  // 续签审批
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ContractRecord | null>(null);
  const [reviewRemark, setReviewRemark] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/labor-contract', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || '获取劳动合同信息失败');
      setRecords(result.records || []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '获取劳动合同信息失败');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const text = keyword.trim();
    return records.filter((record) => {
      if (category !== 'all' && record.category !== category) return false;
      if (onlyPending && record.signed) return false;
      if (!text) return true;
      return [record.name, record.department, record.idCard].some((value) => String(value || '').includes(text));
    });
  }, [records, keyword, onlyPending, category]);

  const byCategory = useMemo(
    () => (category === 'all' ? records : records.filter((record) => record.category === category)),
    [records, category],
  );

  const summary = useMemo(() => ({
    total: byCategory.length,
    signed: byCategory.filter((r) => r.signed).length,
    pending: byCategory.filter((r) => !r.signed).length,
    overdue: byCategory.filter((r) => r.overdue).length,
  }), [byCategory]);

  const openDialog = (record: ContractRecord) => {
    setTarget(record);
    setStatus(record.signed ? '已签订' : '已签订');
    setStartDate(record.contractStartDate || record.hireDate || '');
    setEndDate(record.contractEndDate || '');
    setTermYears(record.contractTermYears || '');
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!target) return;
    if (status === '已签订') {
      if (!startDate) { alert('请填写合同开始日期'); return; }
      if (!endDate) { alert('请填写合同结束日期'); return; }
      if (endDate < startDate) { alert('结束日期不能早于开始日期'); return; }
    }
    setSaving(true);
    try {
      const response = await fetch('/api/labor-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            name: target.name,
            idCard: target.idCard,
            status,
            startDate,
            endDate,
            termYears,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || '保存失败');
      setDialogOpen(false);
      await load();
    } catch (saveError) {
      alert(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remind = async () => {
    setReminding(true);
    try {
      const response = await fetch('/api/labor-contract/remind', { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      alert(result.message || (result.success ? '已执行' : '执行失败'));
      await load();
    } catch (remindError) {
      alert(remindError instanceof Error ? remindError.message : '执行失败');
    } finally {
      setReminding(false);
    }
  };

  const openReview = (record: ContractRecord) => {
    setReviewTarget(record);
    setReviewRemark('');
    setReviewOpen(true);
  };

  const submitReview = async (action: 'approve' | 'reject') => {
    const renewal = reviewTarget?.renewal;
    if (!renewal) return;
    setReviewing(true);
    try {
      const response = await fetch(`/api/labor-contract/renewals/${renewal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, remark: reviewRemark }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || '审核失败');
      alert(result.message || '已处理');
      setReviewOpen(false);
      await load();
    } catch (reviewError) {
      alert(reviewError instanceof Error ? reviewError.message : '审核失败');
    } finally {
      setReviewing(false);
    }
  };

  const renderDays = (record: ContractRecord) => {
    if (record.daysSinceHire === null) return <span className="text-slate-400">无入职日期</span>;
    if (record.signed) {
      return record.expired
        ? <span className="text-amber-600 font-semibold">已到期，可续签</span>
        : <span className="text-emerald-600">有效期至 {record.contractEndDate || '-'}</span>;
    }
    if (record.overdue) return <span className="text-red-600 font-semibold">超期 {Math.abs(record.daysLeft || 0)} 天</span>;
    return <span className="text-amber-600">剩余 {record.daysLeft} 天</span>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-blue-600" />
              劳动合同
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              新员工入职起 {CONTRACT_DAYS} 天内需登记劳动合同，超期会自动发邮件提醒管理员（同一员工只提醒一次）。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="姓名/部门/身份证"
              className="h-9 w-44"
            />
            <Button variant={onlyPending ? 'default' : 'outline'} className={onlyPending ? 'bg-slate-950 hover:bg-slate-800' : ''} onClick={() => setOnlyPending((value) => !value)}>
              只看未登记
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              刷新
            </Button>
            <Button className="bg-amber-500 hover:bg-amber-600" onClick={remind} disabled={reminding}>
              {reminding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              立即检查并提醒
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {([
              ['all', '全部'],
              ['management', '管理部'],
              ['production', '车间'],
            ] as Array<['all' | 'management' | 'production', string]>).map(([key, label]) => (
              <Button
                key={key}
                variant={category === key ? 'default' : 'outline'}
                className={category === key ? 'bg-slate-950 hover:bg-slate-800' : ''}
                onClick={() => setCategory(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['在职员工', summary.total, 'text-slate-900'],
              ['已登记合同', summary.signed, 'text-emerald-600'],
              ['未登记', summary.pending, 'text-amber-600'],
              ['超期未登记', summary.overdue, 'text-red-600'],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">{label}</div>
                <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {error && <div className="mb-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>入职日期</TableHead>
                  <TableHead>已入职</TableHead>
                  <TableHead>合同状态</TableHead>
                  <TableHead>合同期限</TableHead>
                  <TableHead>到期时间</TableHead>
                  <TableHead>续签申请</TableHead>
                  <TableHead>倒计时</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-slate-500">正在加载...</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-slate-500">暂无数据</TableCell></TableRow>
                )}
                {!loading && filtered.map((record) => (
                  <TableRow key={record.employeeId}>
                    <TableCell className="font-medium text-slate-900">{record.name}</TableCell>
                    <TableCell>{record.department || '-'}</TableCell>
                    <TableCell>{record.hireDate || '-'}</TableCell>
                    <TableCell>{record.daysSinceHire === null ? '-' : `${record.daysSinceHire} 天`}</TableCell>
                    <TableCell>
                      <Badge className={record.signed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                        {record.signed ? '已签订' : '未签订'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {record.contractStartDate ? `${record.contractStartDate} ~ ${record.contractEndDate}` : '-'}
                    </TableCell>
                    <TableCell>{record.expireAt || '-'}</TableCell>
                    <TableCell>
                      {record.renewal ? (
                        <span className={record.renewal.status === '待审核' ? 'text-amber-600' : record.renewal.status === '已通过' ? 'text-emerald-600' : 'text-red-500'}>
                          {record.renewal.status} · {record.renewal.appliedAt}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{renderDays(record)}</TableCell>
                    <TableCell className="text-right">
                      {record.pendingRenewal ? (
                        <Button size="sm" className="bg-amber-500 hover:bg-amber-600" onClick={() => openReview(record)}>
                          审核续签
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={record.signed && !record.expired}
                          onClick={() => openDialog(record)}
                        >
                          {record.signed ? (record.expired ? '续签' : '已签订') : '登记'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{target?.name} · {target?.expired ? '劳动合同续签' : '劳动合同登记'}</DialogTitle>
            <DialogDescription>
              入职 {target?.hireDate || '-'}，已入职 {target?.daysSinceHire ?? '-'} 天。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">合同状态 <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-2">
                {(['已签订', '未签订'] as const).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={status === option ? 'default' : 'outline'}
                    className={status === option ? 'bg-slate-950 hover:bg-slate-800' : ''}
                    onClick={() => setStatus(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>
            {status === '已签订' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">开始日期 <span className="text-red-500">*</span></label>
                  <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">结束日期 <span className="text-red-500">*</span></label>
                  <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">合同年限</label>
                  <Input type="number" value={termYears} onChange={(event) => setTermYears(event.target.value)} placeholder="选填，如 3" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{reviewTarget?.name} · 合同续签审核</DialogTitle>
            <DialogDescription>
              申请时间 {reviewTarget?.renewal?.appliedAt || '-'}，申请人 {reviewTarget?.renewal?.appliedBy || '-'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">原合同</div>
              <div className="mt-1 font-medium text-slate-700">
                {reviewTarget?.renewal?.oldStartDate || '-'} ~ {reviewTarget?.renewal?.oldEndDate || '-'}
              </div>
            </div>
            <div className="rounded-md bg-emerald-50 px-3 py-2">
              <div className="text-xs text-emerald-700">续签后</div>
              <div className="mt-1 font-medium text-emerald-800">
                {reviewTarget?.renewal?.newStartDate || '-'} ~ {reviewTarget?.renewal?.newEndDate || '-'}
              </div>
            </div>
            <div className="space-y-1.5 pt-2">
              <label className="text-sm font-medium text-slate-700">审核备注</label>
              <Input value={reviewRemark} onChange={(event) => setReviewRemark(event.target.value)} placeholder="选填" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => submitReview('reject')} disabled={reviewing}>
              驳回
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => submitReview('approve')} disabled={reviewing}>
              {reviewing && <Loader2 className="h-4 w-4 animate-spin" />}
              通过并更新合同
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
