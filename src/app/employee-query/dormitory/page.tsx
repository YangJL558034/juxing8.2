'use client';

import Link from 'next/link';
import { useState } from 'react';
import DormitoryApplicationPage from '@/components/pages/DormitoryApplicationPage';
import { getDraftScope } from '@/lib/portal-draft';

/** 免登录住宿申请：沿用后台「员工住宿舍申请」原表单，仅在职员工可提交 */
export default function PublicDormitoryApplyPage() {
  const [draftKey] = useState(() => getDraftScope('h5-dormitory-apply').key);
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-3 py-3">
          <Link
            href="/employee-query"
            className="flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition active:scale-95"
          >
            <span className="text-lg leading-none">‹</span>
            返回
          </Link>
          <span className="text-sm font-semibold text-slate-900">住宿申请</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[720px] px-3 py-4">
        <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
          无需登录。填写姓名和身份证号后，系统会核验你是否为本单位在职员工；非在职人员无法提交。
          填写内容会自动保存，误点返回后再次进入可继续填写。
        </div>
        <DormitoryApplicationPage publicMode draftKey={draftKey} />
      </div>
    </main>
  );
}
