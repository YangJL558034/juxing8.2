import { chinaToday } from '@/lib/china-time';
import type { ResignationFormData, ResignationRecord, ResignationStatus, ResignationType } from '@/types/resignation';

export interface ResignationDbRow {
  id: number;
  employee_id?: number | null;
  status: ResignationStatus;
  name: string;
  employee_no: string | null;
  department: string | null;
  id_card: string | null;
  position: string | null;
  hire_date: string | null;
  contract_end_date: string | null;
  apply_date: string | null;
  resignation_date: string | null;
  handover_date: string | null;
  resignation_type: ResignationType | null;
  data_json: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export const defaultResignationData: ResignationFormData = {
  name: '',
  employeeNo: '',
  department: '',
  idCard: '',
  position: '',
  hireDate: '',
  contractEndDate: '',
  applyDate: '',
  resignationDate: '',
  handoverDate: '',
  resignationType: '',
  resignationTypeOther: '',
  resignationReason: '',
  applicantSignatureDataUrl: '',
  reviewerName: '',
  reviewRemark: '',
};

export function createDefaultResignationData(): ResignationFormData {
  return {
    ...defaultResignationData,
    applyDate: chinaToday(),
  };
}

function pickType(value: unknown): ResignationType {
  return ['辞职', '辞退', '自离', '开除', '急辞', '其他'].includes(String(value)) ? String(value) as ResignationType : '';
}

export function normalizeResignationData(value: unknown): ResignationFormData {
  const data = typeof value === 'object' && value ? value as Partial<ResignationFormData> : {};
  const merged = { ...createDefaultResignationData(), ...data };
  return {
    ...merged,
    name: String(merged.name || '').trim(),
    employeeNo: String(merged.employeeNo || '').trim(),
    department: String(merged.department || '').trim(),
    idCard: String(merged.idCard || '').trim(),
    position: String(merged.position || '').trim(),
    hireDate: String(merged.hireDate || '').trim(),
    contractEndDate: String(merged.contractEndDate || '').trim(),
    applyDate: String(merged.applyDate || '').trim() || chinaToday(),
    resignationDate: String(merged.resignationDate || '').trim(),
    handoverDate: String(merged.handoverDate || '').trim(),
    resignationType: pickType(merged.resignationType),
    resignationTypeOther: String(merged.resignationTypeOther || '').trim(),
    resignationReason: String(merged.resignationReason || '').trim(),
    applicantSignatureDataUrl: String(merged.applicantSignatureDataUrl || '').trim(),
    reviewerName: String(merged.reviewerName || '').trim(),
    reviewRemark: String(merged.reviewRemark || '').trim(),
  };
}

export function parseResignationRow(row: ResignationDbRow): ResignationRecord {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row.data_json || '{}');
  } catch {
    parsed = {};
  }

  const data = normalizeResignationData(parsed);
  return {
    id: row.id,
    status: row.status === '已审核' ? '已审核' : '待审核',
    data,
    name: row.name || data.name,
    employeeNo: row.employee_no || data.employeeNo,
    department: row.department || data.department,
    idCard: row.id_card || data.idCard,
    position: row.position || data.position,
    hireDate: row.hire_date || data.hireDate,
    contractEndDate: row.contract_end_date || data.contractEndDate,
    applyDate: row.apply_date || data.applyDate,
    resignationDate: row.resignation_date || data.resignationDate,
    handoverDate: row.handover_date || data.handoverDate,
    resignationType: row.resignation_type || data.resignationType,
    reviewerName: row.reviewer_name,
    reviewedAt: row.reviewed_at,
    exportedAt: row.exported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    restoreUntil: row.deleted_at ? addSevenDays(row.deleted_at) : null,
  };
}

function addSevenDays(value: string): string {
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setDate(parsed.getDate() + 7);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
}
