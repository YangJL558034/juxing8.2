import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { verifyToken } from '@/lib/auth';
import { buildSocialSecurityDocx } from '@/lib/social-security-docx';
import { parseSocialSecurityRow, type SocialSecurityDbRow } from '@/lib/social-security-records';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').trim() || '员工';
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 });
    }

    const row = db.prepare('SELECT * FROM social_security_records WHERE id = ? AND deleted_at IS NULL').get(id) as SocialSecurityDbRow | undefined;
    if (!row) {
      return NextResponse.json({ success: false, error: '社保申请不存在或已删除' }, { status: 404 });
    }

    const record = parseSocialSecurityRow(row);
    if (record.documentType === 'purchase') {
      return NextResponse.json({ success: false, error: '购买社保申请无需导出声明文档，请到「购买社保」记录里办理' }, { status: 400 });
    }
    if (record.status === '待审核') {
      return NextResponse.json({ success: false, error: '请先审核社保申请，再导出或打印' }, { status: 400 });
    }

    const buffer = buildSocialSecurityDocx(record);

    db.prepare(`
      UPDATE social_security_records
      SET status = '已导出',
          exported_at = datetime('now', '+8 hours'),
          updated_at = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(id);

    const fileName = `${safeFilePart(record.name)}-${record.documentTitle}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Export social security record error:', error);
    return NextResponse.json({ success: false, error: '导出社保申请失败' }, { status: 500 });
  }
}
