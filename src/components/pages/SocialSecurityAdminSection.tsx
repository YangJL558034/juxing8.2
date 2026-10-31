'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileCheck2, FileText, Loader2, Pencil, RefreshCcw, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  createDefaultSocialSecurityData,
  socialSecurityWaiverReasons,
  socialSecurityDocumentTitle,
} from '@/lib/social-security-records';
import type { SocialSecurityDocumentType, SocialSecurityFormData, SocialSecurityRecord } from '@/types/social-security';
import YearMonthGroupedTableBody from './YearMonthGroupedTableBody';
import SocialSecurityPurchaseManager from './SocialSecurityPurchaseManager';

interface ListResponse {
  success: boolean;
  records?: SocialSecurityRecord[];
  error?: string;
}

interface MutateResponse {
  success: boolean;
  record?: SocialSecurityRecord;
  error?: string;
}

type ListMode = 'active' | 'deleted';
type SocialSecurityAdminMode = 'applications' | 'purchase' | 'all';

function display(value: unknown) {
  const text = String(value ?? '').trim();
  return text || '-';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 19);
}

function cloneData(record: SocialSecurityRecord): SocialSecurityFormData {
  return JSON.parse(JSON.stringify(record.data)) as SocialSecurityFormData;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function InfoGrid({ pairs }: { pairs: Array<[string, unknown]> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {pairs.map(([label, value]) => (
        <div key={label} className="rounded-md bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="mt-1 text-sm font-medium text-slate-900">{display(value)}</div>
        </div>
      ))}
    </div>
  );
}

export default function SocialSecurityAdminSection({ mode = 'all' }: { mode?: SocialSecurityAdminMode }) {
  const [records, setRecords] = useState<SocialSecurityRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | SocialSecurityDocumentType>('all');
  // 管理部 / 车间 分类（声明记录没有 category 字段，按部门判断）
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'management' | 'production'>('all');
  const [listMode, setListMode] = useState<ListMode>('active');
  const [viewOpen, setViewOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<SocialSecurityRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SocialSecurityRecord | null>(null);
  const [editData, setEditData] = useState<SocialSecurityFormData>(() => createDefaultSocialSecurityData());
  const [saving, setSaving] = useState(false);
  // 新建申请（购买 / 不购买社保）
  const [createOpen, setCreateOpen] = useState(false);
  const [createData, setCreateData] = useState<SocialSecurityFormData>(() => createDefaultSocialSecurityData('no_purchase'));
  const [createSaving, setCreateSaving] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (listMode === 'deleted') params.set('deleted', '1');
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const response = await fetch(`/api/social-security?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as ListResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || '获取社保申请记录失败');
      }
      setRecords(result.records || []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '获取社保申请记录失败');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [keyword, listMode, typeFilter]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // 按部门归到 管理部 / 车间
  const visibleRecords = useMemo(() => {
    if (categoryFilter === 'all') return records;
    return records.filter((record) => {
      const department = String(record.department || '');
      const isProduction = /生产|车间|产线|流水/.test(department);
      return categoryFilter === 'production' ? isProduction : !isProduction;
    });
  }, [records, categoryFilter]);

  const updateField = <K extends keyof SocialSecurityFormData>(field: K, value: SocialSecurityFormData[K]) => {
    setEditData((current) => ({ ...current, [field]: value }));
  };

  const openView = (record: SocialSecurityRecord) => {
    setViewTarget(record);
    setViewOpen(true);
  };

  const openEdit = (record: SocialSecurityRecord) => {
    setEditTarget(record);
    setEditData(cloneData(record));
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/social-security/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: editData }),
      });
      const result = await response.json().catch(() => ({})) as MutateResponse;
      if (!response.ok || !result.success) throw new Error(result.error || '修改社保申请失败');
      setEditOpen(false);
      setEditTarget(null);
      await loadRecords();
    } catch (saveError) {
      alert(saveError instanceof Error ? saveError.message : '修改社保申请失败');
    } finally {
      setSaving(false);
    }
  };

  // ===== 新建申请（购买 / 不购买社保）=====
  const openCreate = (type: SocialSecurityDocumentType) => {
    setCreateData(createDefaultSocialSecurityData(type));
    setCreateOpen(true);
  };

  const updateCreateField = <K extends keyof SocialSecurityFormData>(field: K, value: SocialSecurityFormData[K]) => {
    setCreateData((current) => ({ ...current, [field]: value }));
  };

  const switchCreateType = (type: SocialSecurityDocumentType) => {
    setCreateData((current) => ({
      ...createDefaultSocialSecurityData(type),
      name: current.name,
      idCard: current.idCard,
      phone: current.phone,
      department: current.department,
      position: current.position,
      hireDate: current.hireDate,
      applicationDate: current.applicationDate,
    }));
  };

  const submitCreate = async () => {
    if (!createData.name.trim()) { alert('请填写姓名'); return; }
    if (!createData.idCard.trim()) { alert('请填写身份证号'); return; }
    setCreateSaving(true);
    try {
      const response = await fetch('/api/social-security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: createData }),
      });
      const result = await response.json().catch(() => ({})) as MutateResponse;
      if (!response.ok || !result.success) throw new Error(result.error || '创建社保申请失败');
      setCreateOpen(false);
      await loadRecords();
    } catch (createError) {
      alert(createError instanceof Error ? createError.message : '创建社保申请失败');
    } finally {
      setCreateSaving(false);
    }
  };

  const exportRecord = (record: SocialSecurityRecord) => {
    if (record.documentType === 'purchase') {      alert('购买社保申请无需导出声明文档，请到下方「购买社保」记录里办理');
      return;
    }
    if (record.status === '待审核') {
      alert('请先审核社保申请，再导出或打印');
      return;
    }
    window.open(`/api/social-security/${record.id}/export`, '_blank', 'noopener,noreferrer');
    setTimeout(() => void loadRecords(), 800);
  };

  const reviewRecord = async (record: SocialSecurityRecord) => {
    const reviewerName = window.prompt(`请输入审核人姓名：${record.name}`, '')?.trim();
    if (!reviewerName) return;
    try {
      const response = await fetch(`/api/social-security/${record.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewerName }),
      });
      const result = await response.json().catch(() => ({})) as MutateResponse;
      if (!response.ok || !result.success) throw new Error(result.error || '审核社保申请失败');
      await loadRecords();
    } catch (reviewError) {
      alert(reviewError instanceof Error ? reviewError.message : '审核社保申请失败');
    }
  };

  const deleteRecord = async (record: SocialSecurityRecord) => {
    if (!confirm(`确定删除 ${record.name} 的${record.documentTitle}吗？删除后一周内可恢复。`)) return;
    try {
      const response = await fetch(`/api/social-security/${record.id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({})) as MutateResponse;
      if (!response.ok || !result.success) throw new Error(result.error || '删除社保申请失败');
      await loadRecords();
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : '删除社保申请失败');
    }
  };

  const restoreRecord = async (record: SocialSecurityRecord) => {
    try {
      const response = await fetch(`/api/social-security/${record.id}/restore`, { method: 'PATCH' });
      const result = await response.json().catch(() => ({})) as MutateResponse;
      if (!response.ok || !result.success) throw new Error(result.error || '恢复社保申请失败');
      await loadRecords();
    } catch (restoreError) {
      alert(restoreError instanceof Error ? restoreError.message : '恢复社保申请失败');
    }
  };

  const runSearch = () => setKeyword(keywordInput);

  return (
    <>
    {mode !== 'purchase' && (
    <div id="social-security-management" className="scroll-mt-24 mt-4 rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <FileText className="h-4 w-4 text-blue-600" />
            社保管理
          </div>
          <p className="mt-1 text-sm text-slate-500">员工一次提交只生成一条记录，导出文件包含两页社保声明。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
            <Link href="/social-security" target="_blank">社保声明（两页合并）</Link>
          </Button>
          {mode === 'all' && (
            <Button asChild variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              <a href="#social-security-purchase-management">
                <ShieldCheck className="h-4 w-4" />
                购买社保
              </a>
            </Button>
          )}
          <div className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') runSearch();
              }}
              placeholder="姓名/身份证/部门"
              className="h-full w-36 bg-transparent px-2 text-sm outline-none"
            />
          </div>
          <Button variant="outline" onClick={runSearch}>搜索</Button>
          {([
            ['all', '全部部门'],
            ['management', '管理部'],
            ['production', '车间'],
          ] as Array<['all' | 'management' | 'production', string]>).map(([key, label]) => (
            <Button
              key={key}
              variant={categoryFilter === key ? 'default' : 'outline'}
              className={categoryFilter === key ? 'bg-blue-600 hover:bg-blue-700' : ''}
              onClick={() => setCategoryFilter(key)}
            >
              {label}
            </Button>
          ))}
          <Button
            variant={typeFilter === 'all' ? 'default' : 'outline'}
            className={typeFilter === 'all' ? 'bg-slate-950 hover:bg-slate-800' : ''}
            onClick={() => setTypeFilter('all')}
          >
            全部
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-600" onClick={() => openCreate('no_purchase')}>
            填写不购买社保
          </Button>
          <Button
            variant={listMode === 'active' ? 'default' : 'outline'}
            className={listMode === 'active' ? 'bg-slate-950 hover:bg-slate-800' : ''}
            onClick={() => setListMode('active')}
          >
            在用记录
          </Button>
          <Button
            variant={listMode === 'deleted' ? 'default' : 'outline'}
            className={listMode === 'deleted' ? 'bg-slate-950 hover:bg-slate-800' : ''}
            onClick={() => setListMode('deleted')}
          >
            已删除
          </Button>
          <Button variant="outline" onClick={() => void loadRecords()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>文件</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>提交人</TableHead>
              <TableHead>提交时间</TableHead>
              <TableHead>身份证</TableHead>
              <TableHead>手机号</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>岗位</TableHead>
              <TableHead>入职日期</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>审核人</TableHead>
              <TableHead>审核时间</TableHead>
              {listMode === 'deleted' && <TableHead>恢复截止</TableHead>}
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <YearMonthGroupedTableBody
            records={visibleRecords}
            loading={loading}
            colSpan={listMode === 'deleted' ? 14 : 13}
            loadingText="正在加载社保申请..."
            emptyText={listMode === 'deleted' ? '暂无已删除社保申请' : '暂无社保申请记录'}
            getDate={(record) => record.createdAt}
            renderRow={(record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium text-slate-900">{record.documentTitle}</TableCell>
                <TableCell>{display(record.name)}</TableCell>
                <TableCell>{display(record.submittedBy)}</TableCell>
                <TableCell>{formatDateTime(record.submittedAt)}</TableCell>
                <TableCell>{display(record.idCard)}</TableCell>
                <TableCell>{display(record.phone)}</TableCell>
                <TableCell>{display(record.department)}</TableCell>
                <TableCell>{display(record.position)}</TableCell>
                <TableCell>{formatDate(record.hireDate)}</TableCell>
                <TableCell>{record.deletedAt ? '已删除' : record.status}</TableCell>
                <TableCell>{display(record.reviewerName)}</TableCell>
                <TableCell>{formatDateTime(record.reviewedAt)}</TableCell>
                {listMode === 'deleted' && <TableCell>{formatDateTime(record.restoreUntil)}</TableCell>}
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openView(record)}>
                      <Eye className="h-4 w-4" />
                      查看
                    </Button>
                    {listMode === 'deleted' ? (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => restoreRecord(record)}>
                        <RotateCcw className="h-4 w-4" />
                        恢复
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEdit(record)}>
                          <Pencil className="h-4 w-4" />
                          修改
                        </Button>
                        {record.status === '待审核' && (
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => reviewRecord(record)}>
                            <FileCheck2 className="h-4 w-4" />
                            审核
                          </Button>
                        )}
                        {record.documentType !== 'purchase' && (
                          <Button variant="outline" size="sm" onClick={() => exportRecord(record)}>
                            <Download className="h-4 w-4" />
                            导出
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => deleteRecord(record)}>
                          <Trash2 className="h-4 w-4" />
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          />
        </Table>
      </div>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>查看社保申请</DialogTitle>
            <DialogDescription>查看员工填写的个人信息和导出记录。</DialogDescription>
          </DialogHeader>
          {viewTarget && (
            <InfoGrid pairs={[
              ['文件', viewTarget.documentTitle],
              ['姓名', viewTarget.name],
              ['身份证', viewTarget.idCard],
              ['手机号', viewTarget.phone],
              ['部门', viewTarget.department],
              ['岗位', viewTarget.position],
              ['入职日期', formatDate(viewTarget.hireDate)],
              ['申请日期', formatDate(viewTarget.applicationDate)],
              ['公司名称', viewTarget.data.companyName],
              ['社保局城市', viewTarget.data.bureauCity],
              ['鉴于原因', viewTarget.documentType === 'waiver' || viewTarget.documentType === 'combined' ? viewTarget.data.reason : ''],
              ['状态', viewTarget.deletedAt ? '已删除' : viewTarget.status],
              ['提交人', viewTarget.submittedBy],
              ['创建时间', formatDateTime(viewTarget.createdAt)],
              ['审核人', viewTarget.reviewerName],
              ['审核时间', formatDateTime(viewTarget.reviewedAt)],
              ['导出时间', formatDateTime(viewTarget.exportedAt)],
              ['删除时间', formatDateTime(viewTarget.deletedAt)],
              ['恢复截止', formatDateTime(viewTarget.restoreUntil)],
            ]} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>填写社保申请</DialogTitle>
            <DialogDescription>管理员代员工填写；提交后进入待审核，员工也能在小程序里看到进度。</DialogDescription>
          </DialogHeader>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {([
              ['waiver', '自愿放弃'],
              ['no_purchase', '要求不购买'],
            ] as Array<[SocialSecurityDocumentType, string]>).map(([type, label]) => (
              <Button
                key={type}
                type="button"
                variant={createData.documentType === type ? 'default' : 'outline'}
                className={createData.documentType === type ? 'bg-slate-950 hover:bg-slate-800' : ''}
                onClick={() => switchCreateType(type)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="姓名" required value={createData.name} onChange={(value) => updateCreateField('name', value)} />
            <Field label="身份证" required value={createData.idCard} onChange={(value) => updateCreateField('idCard', value)} />
            <Field label="手机号" value={createData.phone} onChange={(value) => updateCreateField('phone', value)} />
            <Field label="部门" value={createData.department} onChange={(value) => updateCreateField('department', value)} />
            <Field label="岗位" value={createData.position} onChange={(value) => updateCreateField('position', value)} />
            <Field label="入职日期" type="date" value={createData.hireDate} onChange={(value) => updateCreateField('hireDate', value)} />
            <Field label="申请日期" type="date" value={createData.applicationDate} onChange={(value) => updateCreateField('applicationDate', value)} />
            <Field label="公司名称" value={createData.companyName} onChange={(value) => updateCreateField('companyName', value)} />
            <Field label="社保局城市" value={createData.bureauCity} onChange={(value) => updateCreateField('bureauCity', value)} />
            <Field
              label={createData.documentType === 'purchase' ? '申请说明' : '鉴于原因'}
              value={createData.reason}
              onChange={(value) => updateCreateField('reason', value)}
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {socialSecurityWaiverReasons.map((reason) => (
              <Button
                key={reason}
                type="button"
                variant={createData.reason === reason ? 'default' : 'outline'}
                className={createData.reason === reason ? 'h-auto min-h-10 justify-start whitespace-normal bg-slate-950 text-left hover:bg-slate-800' : 'h-auto min-h-10 justify-start whitespace-normal text-left'}
                onClick={() => updateCreateField('reason', reason)}
              >
                {reason}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>取消</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={submitCreate} disabled={createSaving}>
              {createSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>修改社保申请</DialogTitle>
            <DialogDescription>可修改员工个人信息；其它内容默认按模板保留。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">文件类型</label>
              <Input value={socialSecurityDocumentTitle(editData.documentType)} readOnly className="bg-slate-50" />
            </div>
            <Field label="姓名" required value={editData.name} onChange={(value) => updateField('name', value)} />
            <Field label="身份证" required value={editData.idCard} onChange={(value) => updateField('idCard', value)} />
            <Field label="手机号" value={editData.phone} onChange={(value) => updateField('phone', value)} />
            <Field label="部门" value={editData.department} onChange={(value) => updateField('department', value)} />
            <Field label="岗位" value={editData.position} onChange={(value) => updateField('position', value)} />
            <Field label="入职日期" type="date" value={editData.hireDate} onChange={(value) => updateField('hireDate', value)} />
            <Field label="申请日期" type="date" value={editData.applicationDate} onChange={(value) => updateField('applicationDate', value)} />
            <Field label="公司名称" value={editData.companyName} onChange={(value) => updateField('companyName', value)} />
            <Field label="社保局城市" value={editData.bureauCity} onChange={(value) => updateField('bureauCity', value)} />
            {editData.documentType !== 'purchase' && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-slate-700">鉴于原因</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {socialSecurityWaiverReasons.map((reason) => (
                    <Button
                      key={reason}
                      type="button"
                      variant={editData.reason === reason ? 'default' : 'outline'}
                      className={editData.reason === reason ? 'h-auto min-h-10 justify-start whitespace-normal bg-slate-950 text-left hover:bg-slate-800' : 'h-auto min-h-10 justify-start whitespace-normal text-left'}
                      onClick={() => updateField('reason', reason)}
                    >
                      {reason}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>取消</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={submitEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    )}
    {mode !== 'applications' && <SocialSecurityPurchaseManager />}
    </>
  );
}
