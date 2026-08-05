import { chinaToday } from '@/lib/china-time';
import type {
  SocialSecurityDocumentType,
  SocialSecurityFormData,
  SocialSecurityRecord,
  SocialSecurityStatus,
} from '@/types/social-security';

export const socialSecurityWaiverReasons = [
  'A、已在老家购买社保',
  'B、个人不愿意扣个人社保及其他私人原因',
] as const;

export interface SocialSecurityDbRow {
  id: number;
  document_type: SocialSecurityDocumentType | string | null;
  status: SocialSecurityStatus | string | null;
  name: string;
  id_card: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  application_date: string | null;
  data_json: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export function socialSecurityDocumentTitle(type: SocialSecurityDocumentType) {
  if (type === 'combined') return '社保声明（两份文件）';
  return type === 'waiver' ? '自愿放弃社保声明' : '要求不购买社保申请书';
}

export function normalizeSocialSecurityDocumentType(value: unknown): SocialSecurityDocumentType {
  if (value === 'combined') return 'combined';
  return value === 'waiver' ? 'waiver' : 'no_purchase';
}

export function normalizeSocialSecurityStatus(value: unknown): SocialSecurityStatus {
  if (value === '已导出') return '已导出';
  if (value === '已审核') return '已审核';
  return '待审核';
}

export function createDefaultSocialSecurityData(type: SocialSecurityDocumentType = 'combined'): SocialSecurityFormData {
  return {
    documentType: type,
    name: '',
    idCard: '',
    phone: '',
    department: '',
    position: '',
    hireDate: '',
    applicationDate: chinaToday(),
    companyName: '东莞山泽新能源科技有限公司',
    bureauCity: '东莞',
    reason: type === 'waiver' || type === 'combined' ? socialSecurityWaiverReasons[0] : '',
  };
}

export function normalizeSocialSecurityWaiverReason(value: unknown): string {
  const text = String(value || '').trim();
  if (/^B\b|^B、个人|私人|不愿意/.test(text)) return socialSecurityWaiverReasons[1];
  if (/^A\b|^A、老家|老家购买/.test(text)) return socialSecurityWaiverReasons[0];
  return text || socialSecurityWaiverReasons[0];
}

export function socialSecurityWaiverReasonCode(value: unknown): 'A' | 'B' {
  return normalizeSocialSecurityWaiverReason(value).startsWith('B') ? 'B' : 'A';
}

export function normalizeSocialSecurityData(value: unknown): SocialSecurityFormData {
  const data = typeof value === 'object' && value ? value as Partial<SocialSecurityFormData> : {};
  const documentType = normalizeSocialSecurityDocumentType(data.documentType);
  const defaults = createDefaultSocialSecurityData(documentType);
  const merged = { ...defaults, ...data, documentType };
  return {
    documentType,
    name: String(merged.name || '').trim(),
    idCard: String(merged.idCard || '').trim(),
    phone: String(merged.phone || '').trim(),
    department: String(merged.department || '').trim(),
    position: String(merged.position || '').trim(),
    hireDate: String(merged.hireDate || '').trim(),
    applicationDate: String(merged.applicationDate || '').trim() || chinaToday(),
    companyName: String(merged.companyName || '').trim() || defaults.companyName,
    bureauCity: String(merged.bureauCity || '').trim() || defaults.bureauCity,
    reason: documentType === 'waiver' || documentType === 'combined'
      ? normalizeSocialSecurityWaiverReason(merged.reason)
      : String(merged.reason || '').trim(),
  };
}

export function parseSocialSecurityRow(row: SocialSecurityDbRow): SocialSecurityRecord {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row.data_json || '{}');
  } catch {
    parsed = {};
  }

  const data = normalizeSocialSecurityData({
    ...(typeof parsed === 'object' && parsed ? parsed : {}),
    documentType: row.document_type,
  });

  const name = row.name || data.name;
  const createdAt = row.created_at;

  return {
    id: row.id,
    documentType: data.documentType,
    documentTitle: socialSecurityDocumentTitle(data.documentType),
    status: normalizeSocialSecurityStatus(row.status),
    data,
    name,
    idCard: row.id_card || data.idCard,
    phone: row.phone || data.phone,
    department: row.department || data.department,
    position: row.position || data.position,
    hireDate: row.hire_date || data.hireDate,
    applicationDate: row.application_date || data.applicationDate,
    submittedBy: name,
    submittedAt: createdAt,
    reviewerName: row.reviewer_name || null,
    reviewedAt: row.reviewed_at || null,
    exportedAt: row.exported_at,
    createdAt,
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
