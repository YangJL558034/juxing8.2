import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database';
import { chinaNowSql } from '@/lib/china-time';
import { getCurrentUser } from '@/lib/auth';

interface OperationLogRow {
  details?: string | null;
  description?: string | null;
  user_name?: string | null;
  username?: string | null;
  [key: string]: unknown;
}

interface OperationLogBody {
  userId?: number | null;
  userName?: string | null;
  module?: string;
  action?: string;
  details?: string | object | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// 获取操作日志列表
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request.headers.get('cookie'));
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ success: false, error: '无权查看操作日志' }, { status: 403 });
    }
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const userId = searchParams.get('userId');
    const moduleFilter = searchParams.get('module');

    const offset = (page - 1) * pageSize;

    let logs: OperationLogRow[];
    let total: number;

    if (userId) {
      logs = query.operationLogs.getByUserId.all(userId, pageSize, offset) as OperationLogRow[];
      total = (query.operationLogs.getAllCount.get() as { count: number }).count;
    } else if (moduleFilter) {
      logs = query.operationLogs.getByModule.all(moduleFilter) as OperationLogRow[];
      total = logs.length;
    } else {
      logs = query.operationLogs.getAll.all(pageSize, offset) as OperationLogRow[];
      total = (query.operationLogs.getAllCount.get() as { count: number }).count;
    }

    // 映射字段名：description -> details
    const mappedLogs = logs.map(log => ({
      ...log,
      details: log.details || log.description || '',
      user_name: log.user_name || log.username || '未知用户',
    }));

    return NextResponse.json({
      success: true,
      data: {
        logs: mappedLogs,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('获取操作日志失败:', error);
    return NextResponse.json(
      { success: false, error: '获取操作日志失败' },
      { status: 500 }
    );
  }
}

// 记录操作日志
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request.headers.get('cookie'));
    if (!currentUser) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }
    const body = await request.json() as OperationLogBody;
    const { action, details, ipAddress, userAgent } = body;
    const moduleName = body.module;

    // 参数映射：details -> description
    const description = typeof details === 'string' ? details : JSON.stringify(details || '');

    query.operationLogs.create.run(
      currentUser.id,
      currentUser.name || currentUser.username,
      moduleName,
      action,
      description,
      ipAddress || null,
      userAgent || null,
      chinaNowSql()
    );

    console.log('操作日志记录成功:', { userId: currentUser.id, userName: currentUser.name, module: moduleName, action });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('记录操作日志失败:', error);
    return NextResponse.json(
      { success: false, error: '记录操作日志失败' },
      { status: 500 }
    );
  }
}
