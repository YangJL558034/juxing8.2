import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

async function main() {
  const source = process.env.CRM_DATABASE_PATH ? path.resolve(process.env.CRM_DATABASE_PATH)
    : process.env.COZE_PROJECT_ENV === 'PROD' ? '/tmp/crm.db' : path.resolve('data/crm.db');
  const directory = process.env.CRM_BACKUP_DIR ? path.resolve(process.env.CRM_BACKUP_DIR) : path.join(path.dirname(source), 'backups');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `crm-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await database.backup(file);
    const backup = new Database(file, { readonly: true });
    try {
      if (backup.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('备份完整性检查失败');
    } finally { backup.close(); }
    console.log(`备份完成并通过完整性检查：${file}`);
  } finally { database.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
