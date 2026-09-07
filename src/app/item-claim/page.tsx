'use client';

import { useEffect, useState } from 'react';
import MobileItemClaims from '@/components/mobile/MobileItemClaims';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ItemClaimPage() {
  const [name, setName] = useState('');
  const [idCard, setIdCard] = useState('');
  const [employee, setEmployee] = useState<{ name: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const saved = window.localStorage.getItem('employee-self-service-identity');
    if (saved) { try { const identity = JSON.parse(saved) as { name?: string }; if (identity.name) setEmployee({ name: identity.name }); } catch { /* ignore invalid local identity */ } }
  }, []);
  const login = async () => {
    setError('');
    const response = await fetch(`/api/employees/query?name=${encodeURIComponent(name)}&idCard=${encodeURIComponent(idCard)}`, { cache: 'no-store' });
    const result = await response.json().catch(() => ({})) as { employee?: { name: string }; error?: string };
    if (!response.ok || !result.employee) { setError(result.error || '姓名或身份证号不正确'); return; }
    window.localStorage.setItem('employee-self-service-identity', JSON.stringify({ name, idCard }));
    setEmployee(result.employee);
  };
  if (!employee) return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">员工身份验证</h1><p className="text-sm text-slate-500">请输入姓名和身份证号后访问物品领用。</p><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="员工姓名" /><Input value={idCard} onChange={(e) => setIdCard(e.target.value)} placeholder="身份证号" /><Button className="w-full" onClick={() => void login()}>验证并进入</Button>{error && <p className="text-sm text-red-600">{error}</p>}</div></main>;
  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4">
      <div className="mx-auto max-w-md">
        <MobileItemClaims canManage={false} standaloneRequest initialApplicantName={employee.name} />
      </div>
    </main>
  );
}
