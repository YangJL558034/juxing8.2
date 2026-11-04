'use client';

import { useState } from 'react';

const USER_TERMS: string[] = [
  "本小程序为用人单位内部人事工具，仅向本单位在职员工开放，用于查询本人工资、考勤、社保、劳动合同及提交各类申请。",
  "用户需使用本人真实姓名与身份证号登录；一个身份仅对应一名员工，登录后仅能查看和操作与本人相关的数据。",
  "用户应妥善保管登录凭证，不得将账号借予他人使用；发现异常请及时联系人事部门。",
  "用户提交的申请（请假、离职、转正、在职证明、社保、劳动合同等）将进入审批流程，审批结果以管理员处理为准。",
  "用户应保证填报信息真实、准确；因信息不实导致的后果由用户自行承担。",
  "如用户离职或不再使用本小程序，可在「我的」页面退出登录，本地缓存数据将被清除。"
];

const PRIVACY_TERMS: string[] = [
  "【收集的信息】姓名、身份证号、手机号（选填）、部门与岗位、劳动合同及社保相关信息、工资与考勤记录、您上传的头像、您提交申请时的手写签名。",
  "【收集目的】用于核实员工身份、展示本人的人事数据、办理考勤与薪酬、处理您提交的各类人事申请。我们仅在实现上述目的所必需的范围内收集信息。",
  "【使用范围】您的个人信息仅用于本小程序内与本人相关的业务展示与办理，不用于用户画像、广告推送或任何与本业务无关的用途。",
  "【存储与保护】数据存储在用人单位已备案的境内云服务器（中华人民共和国境内），通过 HTTPS 加密传输、访问控制与最小权限原则保护；登录凭证仅保存在您当前设备本地，退出登录即清除。",
  "【存储期限】在职期间持续保存；离职后按《劳动合同法》及人事档案管理要求保存，到期后删除或匿名化处理。",
  "【共享与转让】我们不会向任何第三方出售、出租或共享您的个人信息，法律法规另有规定的除外。",
  "【您的权利】您有权查询、更正本人的个人信息，或申请删除；如需行使上述权利，请联系本单位人事部门。",
  "【未成年人保护】本小程序仅面向在职成年人，不面向未满 14 周岁的未成年人。",
  "【联系我们】如对本政策有任何疑问，请联系本单位人事部门或管理员。",
  "【生效与更新】本政策自您首次使用本小程序之日起生效，如有更新将在小程序内公示。"
];

export default function EmployeeAgreementPage() {
  const [tab, setTab] = useState<'user' | 'privacy'>('user');
  const paragraphs = tab === 'user' ? USER_TERMS : PRIVACY_TERMS;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[480px] bg-slate-50 pb-10">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-semibold text-slate-900">协议与政策</h1>
        <p className="mt-0.5 text-xs text-slate-500">聚星人事 · 员工自助平台</p>
      </header>

      <div className="px-4 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1">
          <button
            type="button"
            onClick={() => setTab('user')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${tab === 'user' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
          >
            用户协议
          </button>
          <button
            type="button"
            onClick={() => setTab('privacy')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${tab === 'privacy' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
          >
            隐私政策
          </button>
        </div>

        <article className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          {paragraphs.map((text, index) => (
            <p key={index} className="text-sm leading-6 text-slate-700">
              <span className="mr-1 font-semibold text-slate-900">{index + 1}.</span>
              {text}
            </p>
          ))}
          <p className="pt-2 text-xs text-slate-400">更新日期：2026-10-31</p>
        </article>
      </div>
    </main>
  );
}
