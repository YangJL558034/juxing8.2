import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { parseSocialSecurityRow, type SocialSecurityDbRow } from '@/lib/social-security-records';
import { buildSocialSecurityDocx, buildSocialSecurityMergedDocx } from '@/lib/social-security-docx';

function safeFilePart(value: string | null | undefined) {
  return String(value || '社保声明').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
}

/**
 * 导出某个员工的社保声明：
 * - 传 ids（多条）→ 合并成一个 docx（要求不购买 + 自愿放弃，两页）
 * - 只传一条 → 就导出那一条
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token || !(await verifyToken(token))) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ids = (searchParams.get('ids') || '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: '缺少记录 ID' }, { status: 400 });
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT * FROM social_security_records
      WHERE id IN (${placeholders}) AND deleted_at IS NULL
      ORDER BY CASE document_type WHEN 'no_purchase' THEN 0 WHEN 'combined' THEN 1 ELSE 2 END, id
    `).all(...ids) as SocialSecurityDbRow[];

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '社保声明不存在或已删除' }, { status: 404 });
    }

    const records = rows.map(parseSocialSecurityRow);
    if (records.some((record) => record.status === '待审核')) {
      return NextResponse.json({ success: false, error: '请先审核社保申请，再导出或打印' }, { status: 400 });
    }

    const combined = records.find((record) => record.documentType === 'combined');
    const noPurchase = records.find((record) => record.documentType === 'no_purchase');
    const waiver = records.find((record) => record.documentType === 'waiver');

    let buffer: Buffer;
    let fileName: string;
    if (combined) {
      buffer = buildSocialSecurityDocx(combined);
      fileName = `${safeFilePart(combined.name)}-社保声明（两份文件）.docx`;
    } else if (noPurchase && waiver) {
      buffer = buildSocialSecurityMergedDocx(noPurchase, waiver);
      fileName = `${safeFilePart(noPurchase.name)}-社保声明（两份文件）.docx`;
    } else {
      const single = records[0];
      buffer = buildSocialSecurityDocx(single);
      fileName = `${safeFilePart(single.name)}-${single.documentTitle}.docx`;
    }

    db.prepare(`
      UPDATE social_security_records
      SET status = '已导出', exported_at = datetime('now', '+8 hours'), updated_at = datetime('now', '+8 hours')
      WHERE id IN (${placeholders})
    `).run(...ids);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Export merged social security error:', error);
    return NextResponse.json({ success: false, error: '导出社保声明失败' }, { status: 500 });
  }
}
