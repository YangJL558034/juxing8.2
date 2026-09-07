'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Download, Eye, FileCheck2, Loader2, Pencil, RefreshCcw, RotateCcw, Trash2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import type { ResignationFormData, ResignationRecord, ResignationType } from '@/types/resignation';
import YearMonthGroupedTableBody from './YearMonthGroupedTableBody';

interface ListResponse {
  success: boolean;
  records?: ResignationRecord[];
  error?: string;
}

interface MutateResponse {
  success: boolean;
  record?: ResignationRecord;
  error?: string;
}

type ListMode = 'pending' | 'reviewed' | 'deleted';
type FormMode = 'review' | 'edit';

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

function cloneData(record: ResignationRecord): ResignationFormData {
  return JSON.parse(JSON.stringify(record.data)) as ResignationFormData;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
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

export default function ResignationAdminSection() {
  const [records, setRecords] = useState<ResignationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listMode, setListMode] = useState<ListMode>('pending');
  const [viewOpen, setViewOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<ResignationRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('review');
  const [formTarget, setFormTarget] = useState<ResignationRecord | null>(null);
  const [formData, setFormData] = useState<ResignationFormData | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (listMode === 'deleted') {
        params.set('deleted', '1');
      } else {
        params.set('status', listMode === 'pending' ? '待审核' : '已审核');
      }
      const response = await fetch(`/api/resignation?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({})) as ListResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || '获取员工离职申请失败');
      }
      setRecords(result.records || []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '获取员工离职申请失败');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [listMode]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const updateField = <K extends keyof ResignationFormData>(field: K, value: ResignationFormData[K]) => {
    setFormData((current) => current ? { ...current, [field]: value } : current);
  };

  const openView = (record: ResignationRecord) => {
    setViewTarget(record);
    setViewOpen(true);
  };

  const openForm = (record: ResignationRecord, mode: FormMode) => {
    setFormTarget(record);
    setFormMode(mode);
    setFormData(cloneData(record));
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!formTarget || !formData) return;
    setSaving(true);
    try {
      const response = await fetch(
        formMode === 'review' ? `/api/resignation/${formTarget.id}/review` : `/api/resignation/${formTarget.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: formData }),
        },
      );
      const result = await response.json().catch(() => ({})) as MutateResponse;
      if (!response.ok || !result.success || !result.record) {
        throw new Error(result.error || (formMode === 'review' ? '审核员工离职申请失败' : '修改员工离职申请失败'));
      }
      setFormOpen(false);
      setFormTarget(null);
      setFormData(null);
      if (formMode === 'review') setListMode('reviewed');
      await loadRecords();
    } catch (saveError) {
      alert(saveError instanceof Error ? saveError.message : '保存员工离职申请失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (record: ResignationRecord) => {
    if (!confirm(`确定删除 ${record.name} 的离职申请吗？删除后一周内可恢复，超过一周会完全清除。`)) return;
    try {
      const response = await fetch(`/api/resignation/${record.id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({})) as MutateResponse;
      if (!response.ok || !result.success) throw new Error(result.error || '删除员工离职申请失败');
      await loadRecords();
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : '删除员工离职申请失败');
    }
  };

  const restoreRecord = async (record: ResignationRecord) => {
    try {
      const response = await fetch(`/api/resignation/${record.id}/restore`, { method: 'PATCH' });
      const result = await response.json().catch(() => ({})) as MutateResponse;
      if (!response.ok || !result.success) throw new Error(result.error || '恢复员工离职申请失败');
      await loadRecords();
    } catch (restoreError) {
      alert(restoreError instanceof Error ? restoreError.message : '恢复员工离职申请失败');
    }
  };

  const exportRecord = (record: ResignationRecord) => {
    if (record.status !== '已审核') {
      alert('请先审核员工离职申请，再导出表格');
      return;
    }
    window.open(`/api/resignation/${record.id}/export`, '_blank', 'noopener,noreferrer');
    setTimeout(() => void loadRecords(), 800);
  };

  return (
    <div className="mt-4 rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <FileCheck2 className="h-4 w-4 text-blue-600" />
            员工离职申请表
          </div>
          <p className="mt-1 text-sm text-slate-500">使用上传的离职申请表模板导出，第一页员工填写，第二页自动补姓名、正式离职日期和交接日期。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={listMode === 'pending' ? 'default' : 'outline'}
            className={listMode === 'pending' ? 'bg-slate-950 hover:bg-slate-800' : ''}
            onClick={() => setListMode('pending')}
          >
            待审核
          </Button>
          <Button
            variant={listMode === 'reviewed' ? 'default' : 'outline'}
            className={listMode === 'reviewed' ? 'bg-slate-950 hover:bg-slate-800' : ''}
            onClick={() => setListMode('reviewed')}
          >
            已审核
          </Button>
          <Button
            variant={listMode === 'deleted' ? 'default' : 'outline'}
            className={listMode === 'deleted' ? 'bg-slate-950 hover:bg-slate-800' : ''}
            onClick={() => setListMode('deleted')}
          >
            已删除
          </Button>
          <Button asChild variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
            <Link href="/resignation" target="_blank">打开移动端入口</Link>
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
              <TableHead>姓名</TableHead>
              <TableHead>工号</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>职位</TableHead>
              <TableHead>离职日期</TableHead>
              <TableHead>交接日期</TableHead>
              <TableHead>状态</TableHead>
              {listMode === 'deleted' && <TableHead>恢复截止</TableHead>}
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <YearMonthGroupedTableBody
            records={records}
            loading={loading}
            colSpan={listMode === 'deleted' ? 9 : 8}
            loadingText="正在加载员工离职申请..."
            emptyText={listMode === 'pending' ? '暂无待审核员工离职申请' : listMode === 'reviewed' ? '暂无已审核员工离职申请' : '暂无已删除员工离职申请'}
            getDate={(record) => record.createdAt}
            renderRow={(record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium text-slate-900">{display(record.name)}</TableCell>
                <TableCell>{display(record.employeeNo)}</TableCell>
                <TableCell>{display(record.department)}</TableCell>
                <TableCell>{display(record.position)}</TableCell>
                <TableCell>{formatDate(record.resignationDate)}</TableCell>
                <TableCell>{formatDate(record.handoverDate)}</TableCell>
                <TableCell>{record.deletedAt ? '已删除' : record.status}</TableCell>
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
                        {record.status === '已审核' ? (
                          <Button variant="outline" size="sm" onClick={() => exportRecord(record)}>
                            <Download className="h-4 w-4" />
                            导出
                          </Button>
                        ) : (
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => openForm(record, 'review')}>
                            <FileCheck2 className="h-4 w-4" />
                            审核
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => openForm(record, 'edit')}>
                          <Pencil className="h-4 w-4" />
                          修改
                        </Button>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>查看员工离职申请</DialogTitle>
            <DialogDescription>查看移动端填写内容、后台审核状态和删除恢复时间。</DialogDescription>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4">
              <InfoGrid pairs={[
                ['姓名', viewTarget.name],
                ['工号', viewTarget.employeeNo],
                ['部门', viewTarget.department],
                ['身份证号码', viewTarget.idCard],
                ['职位', viewTarget.position],
                ['入职日期', formatDate(viewTarget.hireDate)],
                ['合同有效期至', formatDate(viewTarget.contractEndDate)],
                ['申请日期', formatDate(viewTarget.applyDate)],
                ['正式离职日期', formatDate(viewTarget.resignationDate)],
                ['交接日期', formatDate(viewTarget.handoverDate)],
                ['离职类型', viewTarget.resignationType === '急辞' ? '急辞（自愿扣除20%工资）' : viewTarget.resignationType === '其他' ? `其他 ${viewTarget.data.resignationTypeOther}` : viewTarget.resignationType],
                ['状态', viewTarget.deletedAt ? '已删除' : viewTarget.status],
                ['审核人', viewTarget.reviewerName],
                ['审核时间', formatDateTime(viewTarget.reviewedAt)],
                ['导出时间', formatDateTime(viewTarget.exportedAt)],
                ['删除时间', formatDateTime(viewTarget.deletedAt)],
                ['恢复截止', formatDateTime(viewTarget.restoreUntil)],
              ]} />
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <div className="mb-1 font-medium text-slate-900">离职原因</div>
                <div className="whitespace-pre-wrap leading-6">{viewTarget.data.resignationReason || '-'}</div>
              </div>
              {viewTarget.data.applicantSignatureDataUrl ? (
                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">手写签名</div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Employee signatures are stored as local data URLs. */}
                  <img
                    src={viewTarget.data.applicantSignatureDataUrl}
                    alt="员工手写签名"
                    className="h-24 max-w-full rounded-md border border-slate-200 bg-white object-contain p-2"
                  />
                </div>
              ) : null}
              {viewTarget.data.reviewRemark && (
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="mb-1 font-medium text-slate-900">后台备注</div>
                  <div className="whitespace-pre-wrap leading-6">{viewTarget.data.reviewRemark}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{formMode === 'review' ? '审核员工离职申请' : '修改员工离职申请'}</DialogTitle>
            <DialogDescription>导出时只替换源模板已有字段；总经理意见和交接清单其它项目保持空白。</DialogDescription>
          </DialogHeader>
          {formTarget && formData && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="姓名" value={formData.name} onChange={(value) => updateField('name', value)} />
                <Field label="工号" value={formData.employeeNo} onChange={(value) => updateField('employeeNo', value)} />
                <Field label="部门" value={formData.department} onChange={(value) => updateField('department', value)} />
                <Field label="身份证号码" value={formData.idCard} onChange={(value) => updateField('idCard', value)} />
                <Field label="职位" value={formData.position} onChange={(value) => updateField('position', value)} />
                <Field label="入职日期" type="date" value={formData.hireDate} onChange={(value) => updateField('hireDate', value)} />
                <Field label="合同有效期至" type="date" value={formData.contractEndDate} onChange={(value) => updateField('contractEndDate', value)} />
                <Field label="申请日期" type="date" value={formData.applyDate} onChange={(value) => updateField('applyDate', value)} />
                <Field label="正式离职日期" type="date" value={formData.resignationDate} onChange={(value) => updateField('resignationDate', value)} />
                <Field label="交接日期" type="date" value={formData.handoverDate} onChange={(value) => updateField('handoverDate', value)} />
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">离职类型</label>
                  <select
                    value={formData.resignationType}
                    onChange={(event) => updateField('resignationType', event.target.value as ResignationType)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">请选择</option>
                    <option value="辞职">辞职</option>
                    <option value="辞退">辞退</option>
                    <option value="自离">自离</option>
                    <option value="开除">开除</option>
                    <option value="急辞">急辞（自愿扣除20%工资）</option>
                    {formData.resignationType === '其他' && <option value="其他">其他（历史记录）</option>}
                  </select>
                </div>
                <Field label="其他说明" value={formData.resignationTypeOther} onChange={(value) => updateField('resignationTypeOther', value)} />
                <Field label="审核人" value={formData.reviewerName} onChange={(value) => updateField('reviewerName', value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">离职原因</label>
                <Textarea value={formData.resignationReason} onChange={(event) => updateField('resignationReason', event.target.value)} className="min-h-28" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">后台备注</label>
                <Textarea value={formData.reviewRemark} onChange={(event) => updateField('reviewRemark', event.target.value)} className="min-h-20" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>取消</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={submitForm} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {formMode === 'review' ? '完成审核' : '保存修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
