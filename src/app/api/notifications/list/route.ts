import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database';
import { getCurrentUser } from '@/lib/auth';

// 获取所有通知列表（管理员用）
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request.headers.get('cookie'));
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: '无权查看通知管理数据' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const requestedPageSize = Number.parseInt(searchParams.get('pageSize') || '20', 10);
    const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
    const pageSize = Number.isFinite(requestedPageSize) ? Math.min(100, Math.max(1, requestedPageSize)) : 20;
    const offset = (page - 1) * pageSize;

    // 获取通知总数
    const countResult = query.notifications.getAllCount.get() as { count: number };
    const total = countResult.count;

    // 获取通知列表
    const notifications = query.notifications.getAll.all(pageSize, offset) as Array<{
      id: number;
      title: string;
      content: string;
      sender_id: number;
      sender_name: string;
      receiver_id: number;
      receiver_name: string;
      is_read: number;
      read_at: string | null;
      email_sent: number;
      email_error: string | null;
      created_at: string;
      type: string;
      attachment_file: string | null;
      attachment_file_name: string | null;
    }>;

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error('获取通知列表失败:', error);
    return NextResponse.json({ error: '获取通知列表失败' }, { status: 500 });
  }
}
