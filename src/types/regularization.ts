export type RegularizationStatus = '待处理' | '已审核' | '已驳回';

export interface RegularizationFormData {
  fillDate: string;
  applicantName: string;
  department: string;
  position: string;
  hireDate: string;
  regularizationDate: string;
  workSummary: string;
  applicantDate: string;
  applicantSignatureDataUrl: string;
  rating: '优秀' | '良好' | '合格' | '需改进' | '不合格' | '';
  suggestion: '提前转正' | '按期转正' | '辞退' | '转岗' | '';
  suggestionDate: string;
  transferPosition: string;
  salarySuggestion: '无' | '建议为' | '';
  salaryAmount: string;
  socialSecurity: '不买社保' | '社保起购年月' | '';
  socialSecurityMonth: string;
  otherOpinion: string;
  departmentManager: string;
  departmentDate: string;
  hrOpinion: string;
  hrLeader: string;
  hrDate: string;
  companyOpinion: string;
  companyLeader: string;
  companyDate: string;
}

export interface RegularizationRecord {
  id: number;
  status: RegularizationStatus;
  data: RegularizationFormData;
  applicantName: string;
  department: string;
  position: string;
  hireDate: string;
  regularizationDate: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  restoreUntil: string | null;
}
