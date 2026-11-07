'use client';

import DormitoryApplicationPage from '@/components/pages/DormitoryApplicationPage';

/** 免登录住宿申请：沿用后台「员工住宿舍申请」原表单，仅在职员工可提交 */
export default function PublicDormitoryApplyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[720px] px-3 py-4">
        <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
          无需登录。填写姓名和身份证号后，系统会核验你是否为本单位在职员工；非在职人员无法提交。
        </div>
        <DormitoryApplicationPage publicMode />
      </div>
    </main>
  );
}
