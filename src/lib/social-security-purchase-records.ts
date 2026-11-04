import type {
  SocialSecurityPurchaseCategory,
  SocialSecurityPurchaseFormData,
  SocialSecurityPurchaseRecord,
} from '@/types/social-security-purchase';

export interface SocialSecurityPurchaseDbRow {
  id: number;
  category: SocialSecurityPurchaseCategory | string | null;
  contract_status: string | null;
  department: string | null;
  employee_name: string | null;
  domicile: string | null;
  id_card: string | null;
  phone: string | null;
  bank_card: string | null;
  gender: string | null;
  birth_date: string | null;
  education: string | null;
  insurance_status: string | null;
  contract_count: string | null;
  contract_start_date: string | null;
  contract_term_years: string | null;
  contract_end_date: string | null;
  due_days: string | null;
  employment_status: string | null;
  resignation_date: string | null;
  confidentiality_agreement: string | null;
  probation_salary: string | null;
  remarks: string | null;
  data_json: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

type SocialSecurityPurchaseImportField = Exclude<keyof SocialSecurityPurchaseFormData, 'category'>;

export const socialSecurityPurchaseHeaders: Array<[SocialSecurityPurchaseImportField, string]> = [
  ['contractStatus', '合同状态'],
  ['department', '部门'],
  ['employeeName', '员工'],
  ['domicile', '户籍地（省市）'],
  ['idCard', '身份证号'],
  ['phone', '手机号'],
  ['bankCard', '工资卡号'],
  ['gender', '性别'],
  ['birthDate', '出生年月'],
  ['education', '学历'],
  ['insuranceStatus', '保险情况'],
  ['contractCount', '合同次数'],
  ['contractStartDate', '合同开始日期'],
  ['contractTermYears', '期限(年)'],
  ['contractEndDate', '合同结束日期'],
  ['dueDays', '到期天数'],
  ['employmentStatus', '状态'],
  ['resignationDate', '离职日期'],
  ['confidentialityAgreement', '保密协议'],
  ['probationSalary', '试用期工资'],
  ['remarks', '备注'],
];

export function normalizeSocialSecurityPurchaseCategory(value: unknown): SocialSecurityPurchaseCategory {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'management' || text.includes('管理')) return 'management';
  return 'production';
}

export function socialSecurityPurchaseCategoryLabel(value: unknown) {
  return normalizeSocialSecurityPurchaseCategory(value) === 'management' ? '管理部' : '车间';
}

export function createDefaultSocialSecurityPurchaseData(category: SocialSecurityPurchaseCategory = 'production'): SocialSecurityPurchaseFormData {
  return {
    category,
    contractStatus: '',
    department: socialSecurityPurchaseCategoryLabel(category),
    employeeName: '',
    domicile: '',
    idCard: '',
    phone: '',
    bankCard: '',
    gender: '',
    birthDate: '',
    education: '',
    insuranceStatus: '',
    contractCount: '',
    contractStartDate: '',
    contractTermYears: '',
    contractEndDate: '',
    dueDays: '',
    employmentStatus: '',
    resignationDate: '',
    confidentialityAgreement: '',
    probationSalary: '',
    remarks: '',
  };
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeSocialSecurityPurchaseData(value: unknown): SocialSecurityPurchaseFormData {
  const data = typeof value === 'object' && value ? value as Partial<SocialSecurityPurchaseFormData> : {};
  const category = normalizeSocialSecurityPurchaseCategory(data.category);
  const defaults = createDefaultSocialSecurityPurchaseData(category);
  const merged = { ...defaults, ...data, category };

  return {
    category,
    contractStatus: text(merged.contractStatus),
    department: text(merged.department) || defaults.department,
    employeeName: text(merged.employeeName),
    domicile: text(merged.domicile),
    idCard: text(merged.idCard),
    phone: text(merged.phone),
    bankCard: text(merged.bankCard),
    gender: text(merged.gender),
    birthDate: text(merged.birthDate),
    education: text(merged.education),
    insuranceStatus: text(merged.insuranceStatus),
    contractCount: text(merged.contractCount),
    contractStartDate: text(merged.contractStartDate),
    contractTermYears: text(merged.contractTermYears),
    contractEndDate: text(merged.contractEndDate),
    dueDays: text(merged.dueDays),
    employmentStatus: text(merged.employmentStatus),
    resignationDate: text(merged.resignationDate),
    confidentialityAgreement: text(merged.confidentialityAgreement),
    probationSalary: text(merged.probationSalary),
    remarks: text(merged.remarks),
  };
}

export function parseSocialSecurityPurchaseRow(row: SocialSecurityPurchaseDbRow): SocialSecurityPurchaseRecord {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(row.data_json || '{}');
  } catch {
    parsed = {};
  }

  const data = normalizeSocialSecurityPurchaseData({
    ...(typeof parsed === 'object' && parsed ? parsed : {}),
    category: row.category,
    contractStatus: row.contract_status,
    department: row.department,
    employeeName: row.employee_name,
    domicile: row.domicile,
    idCard: row.id_card,
    phone: row.phone,
    bankCard: row.bank_card,
    gender: row.gender,
    birthDate: row.birth_date,
    education: row.education,
    insuranceStatus: row.insurance_status,
    contractCount: row.contract_count,
    contractStartDate: row.contract_start_date,
    contractTermYears: row.contract_term_years,
    contractEndDate: row.contract_end_date,
    dueDays: row.due_days,
    employmentStatus: row.employment_status,
    reviewStatus: (row as unknown as { review_status?: string | null }).review_status || '已通过',
    reviewRemark: (row as unknown as { review_remark?: string | null }).review_remark || '',
    resignationDate: row.resignation_date,
    confidentialityAgreement: row.confidentiality_agreement,
    probationSalary: row.probation_salary,
    remarks: row.remarks,
  });

  return {
    id: row.id,
    ...data,
    categoryLabel: socialSecurityPurchaseCategoryLabel(data.category),
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
