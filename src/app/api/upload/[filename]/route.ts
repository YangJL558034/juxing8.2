import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // 路径遍历防御：filename 来自 URL，攻击者可控。
    // 拒绝包含路径分隔符、.. 或绝对路径的输入，避免读取出 uploads 目录外的任意文件
    // （如 .env、data/crm.db 等敏感文件）。
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..') || path.isAbsolute(filename)) {
      return NextResponse.json({ error: '非法文件名' }, { status: 400 });
    }

    // 兼容通知中心上传到 public/uploads 以及历史 notifications 子目录的文件
    const rootPath = path.join(process.cwd(), 'public', 'uploads', filename);
    const legacyPath = path.join(process.cwd(), 'public', 'uploads', 'notifications', filename);
    const filePath = existsSync(rootPath) ? rootPath : legacyPath;
    
    console.log(`[Download API] 尝试读取文件: ${filePath}`);
    
    if (!existsSync(filePath)) {
      console.log(`[Download API] 文件不存在: ${filePath}`);
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    
    const fileBuffer = await readFile(filePath);
    
    // 根据文件扩展名设置 Content-Type
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.csv': 'text/csv',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    console.log(`[Download API] 文件读取成功，Content-Type: ${contentType}`);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('File serve error:', error);
    return NextResponse.json({ error: '读取文件失败' }, { status: 500 });
  }
}
