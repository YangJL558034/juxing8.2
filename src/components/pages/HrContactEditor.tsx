'use client';

import { useEffect, useState } from 'react';
import { Save, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface HrContact {
  name: string;
  phone: string;
  label?: string;
}

/** 小程序「我的 → HR 联系方式」展示的联系人，在这里配置 */
export default function HrContactEditor({ compact = false }: { compact?: boolean }) {
  const [contacts, setContacts] = useState<HrContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/hr-contact-config', { cache: 'no-store' });
        const data = await res.json();
        if (data.success && Array.isArray(data.contacts)) {
          setContacts(data.contacts);
        }
      } catch (error) {
        console.error('Load HR contacts error:', error);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const update = (index: number, patch: Partial<HrContact>) => {
    setContacts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/hr-contact-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts }),
      });
      const data = await res.json();
      if (data.success) {
        setContacts(data.contacts || []);
        setMessage('已保存');
      } else {
        setMessage(data.error || '保存失败');
      }
    } catch (error) {
      console.error('Save HR contacts error:', error);
      setMessage('保存失败，请稍后重试');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  return (
    <Card>
      <CardHeader className={compact ? 'pb-3' : undefined}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">HR 联系方式</CardTitle>
            <CardDescription className="mt-1">
              员工在小程序「我的 → HR 联系方式」看到的人；不填则自动取人事/行政岗位员工
            </CardDescription>
          </div>
          {message && (
            <span className={`text-sm ${message.includes('失败') ? 'text-red-600' : 'text-emerald-600'}`}>{message}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="text-sm text-slate-500">加载中...</div>}
        {!loading && contacts.length === 0 && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
            还没有配置，点下方「添加联系人」填写
          </div>
        )}
        {contacts.map((item, index) => (
          <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
            <Input placeholder="姓名" value={item.name} onChange={(e) => update(index, { name: e.target.value })} />
            <Input placeholder="部门/说明，如 人事部" value={item.label || ''} onChange={(e) => update(index, { label: e.target.value })} />
            <Input placeholder="手机号（11 位）" value={item.phone} onChange={(e) => update(index, { phone: e.target.value })} />
            <Button
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => setContacts((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            disabled={contacts.length >= 10}
            onClick={() => setContacts((prev) => [...prev, { name: '', phone: '', label: '' }])}
          >
            <Plus className="h-4 w-4 mr-2" />
            添加联系人
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
