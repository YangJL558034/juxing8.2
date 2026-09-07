import { chinaToday } from '@/lib/china-time';
import type { RegularizationFormData, RegularizationRecord, RegularizationStatus } from '@/types/regularization';

export interface RegularizationDbRow {
  id: number;
  employee_id?: number | null;
  status: RegularizationStatus;
  applicant_name: string;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  regularization_date: string | null;
  data_json: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export const defaultRegularizationData: RegularizationFormData = {
  fillDate: '',
  applicantName: '',
  department: '',
  position: '',
  hireDate: '',
  regularizationDate: '',
  workSummary: '',
  applicantDate: '',
  applicantSignatureDataUrl: '',
  rating: '',
  suggestion: '',
  suggestionDate: '',
  transferPosition: '',
  salarySuggestion: '',
  salaryAmount: '',
  socialSecurity: '',
  socialSecurityMonth: '',
  otherOpinion: '',
  departmentManager: '',
  departmentDate: '',
  hrOpinion: '',
  hrLeader: '',
  hrDate: '',
  companyOpinion: '',
  companyLeader: '',
  companyDate: '',
};

export function createDefaultRegularizationData(): RegularizationFormData {
  const today = chinaToday();
  return {
    ...defaultRegularizationData,
    fillDate: today,
    applicantDate: today,
  };
}

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}

export function normalizeRegularizationData(value: unknown): RegularizationFormData {
  const data = typeof value === 'object' && value ? value as Partial<RegularizationFormData> : {};
  const merged = { ...createDefaultRegularizationData(), ...data };
  return {
    ...merged,
    applicantName: String(merged.applicantName || '').trim(),
    department: String(merged.department || '').trim(),
    position: String(merged.position || '').trim(),
    workSummary: String(merged.workSummary || '').trim(),
    applicantSignatureDataUrl: String(merged.applicantSignatureDataUrl || '').trim(),
    rating: pick(merged.rating, ['优秀', '良好', '合格', '需改进', '不合格', ''] as const, ''),
    suggestion: pick(merged.suggestion, ['提前转正', '按期转正', '辞退', '转岗', ''] as const, ''),
    salarySuggestion: pick(merged.salarySuggestion, ['无', '建议为', ''] as const, ''),
    socialSecurity: pick(merged.socialSecurity, ['不买社保', '社保起购年月', ''] as const, ''),
  };
}

export function parseRegularizationRow(row: RegularizationDbRow): RegularizationRecord {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row.data_json || '{}');
  } catch {
    parsed = {};
  }

  const data = normalizeRegularizationData(parsed);
  return {
    id: row.id,
    status: row.status === '已审核' ? '已审核' : '待处理',
    data,
    applicantName: row.applicant_name || data.applicantName,
    department: row.department || data.department,
    position: row.position || data.position,
    hireDate: row.hire_date || data.hireDate,
    regularizationDate: row.regularization_date || data.regularizationDate,
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
