import { db } from '@/lib/database';

export interface HrContactItem {
  name: string;
  phone: string;
  label?: string;
}

export function ensureHrContactTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hr_contact_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      contacts_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT
    )
  `);
}

/** 读取后台配置的 HR 联系方式 */
export function readHrContacts(): HrContactItem[] {
  try {
    ensureHrContactTable();
    const row = db.prepare('SELECT contacts_json FROM hr_contact_config WHERE id = 1')
      .get() as { contacts_json: string } | undefined;
    if (!row) return [];
    const parsed = JSON.parse(row.contacts_json || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        const obj = (item || {}) as Record<string, unknown>;
        return {
          name: String(obj.name || '').trim(),
          phone: String(obj.phone || '').trim(),
          label: String(obj.label || '').trim(),
        };
      })
      .filter((item) => item.name && item.phone);
  } catch (error) {
    console.error('readHrContacts error:', error);
    return [];
  }
}

/** 保存 HR 联系方式（最多 10 条，手机号必须 11 位） */
export function saveHrContacts(input: unknown): HrContactItem[] {
  ensureHrContactTable();
  const list = Array.isArray(input) ? input : [];
  const contacts = list
    .map((item) => {
      const obj = (item || {}) as Record<string, unknown>;
      return {
        name: String(obj.name || '').trim(),
        phone: String(obj.phone || '').trim(),
        label: String(obj.label || '').trim(),
      };
    })
    .filter((item) => item.name && /^1\d{10}$/.test(item.phone))
    .slice(0, 10);

  db.prepare(`
    INSERT INTO hr_contact_config (id, contacts_json, updated_at)
    VALUES (1, ?, datetime('now', '+8 hours'))
    ON CONFLICT(id) DO UPDATE SET contacts_json = excluded.contacts_json, updated_at = excluded.updated_at
  `).run(JSON.stringify(contacts));

  return contacts;
}
