export type SocialSecurityDocumentType = 'combined' | 'no_purchase' | 'waiver';
export type SocialSecurityStatus = '待审核' | '已审核' | '已导出';

export interface SocialSecurityFormData {
  documentType: SocialSecurityDocumentType;
  name: string;
  idCard: string;
  phone: string;
  department: string;
  position: string;
  hireDate: string;
  applicationDate: string;
  companyName: string;
  bureauCity: string;
  reason: string;
}

export interface SocialSecurityRecord {
  id: number;
  documentType: SocialSecurityDocumentType;
  documentTitle: string;
  status: SocialSecurityStatus;
  data: SocialSecurityFormData;
  name: string;
  idCard: string;
  phone: string;
  department: string;
  position: string;
  hireDate: string;
  applicationDate: string;
  submittedBy: string;
  submittedAt: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  exportedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  restoreUntil: string | null;
}
