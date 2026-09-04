export type ResignationStatus = '待审核' | '已审核';

export type ResignationType = '辞职' | '辞退' | '自离' | '开除' | '急辞' | '其他' | '';

export interface ResignationFormData {
  name: string;
  employeeNo: string;
  department: string;
  idCard: string;
  position: string;
  hireDate: string;
  contractEndDate: string;
  applyDate: string;
  resignationDate: string;
  handoverDate: string;
  resignationType: ResignationType;
  resignationTypeOther: string;
  resignationReason: string;
  applicantSignatureDataUrl: string;
  reviewerName: string;
  reviewRemark: string;
}

export interface ResignationRecord {
  id: number;
  status: ResignationStatus;
  data: ResignationFormData;
  name: string;
  employeeNo: string;
  department: string;
  idCard: string;
  position: string;
  hireDate: string;
  contractEndDate: string;
  applyDate: string;
  resignationDate: string;
  handoverDate: string;
  resignationType: ResignationType;
  reviewerName: string | null;
  reviewedAt: string | null;
  exportedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  restoreUntil: string | null;
}
