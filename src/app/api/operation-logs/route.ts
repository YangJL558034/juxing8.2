import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/database';
import { chinaNowSql } from '@/lib/china-time';
import { getCurrentUser } from '@/lib/auth';
import { getEmployeeByRequest as getEmployeeSession } from '@/lib/employee-session';

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
  /** 来源标识：miniprogram = 小程序 */
  source?: string;
  /** 小程序端兜底身份：姓名 + 身份证（会话 cookie 不可用时） */
  employeeName?: string;
  idCard?: string;
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
    const body = await request.json() as OperationLogBody;

    // 身份识别三条路径：管理员 JWT → 小程序员工会话 → 姓名+身份证兜底
    const currentUser = await getCurrentUser(request.headers.get('cookie'));
    const employeeSession = currentUser ? null : getEmployeeSession(request);

    let actorId: number | null = null;
    let actorName = '';

    if (currentUser) {
      actorId = currentUser.id;
      actorName = currentUser.name || currentUser.username;
    } else if (employeeSession) {
      actorName = employeeSession.name;
    } else {
      const name = String(body.employeeName || '').trim();
      const idCard = String(body.idCard || '').trim().toUpperCase();
      if (!name || !idCard) {
        return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
      }
      const employee = query.getEmployeeByNameAndIdCard.get(name, idCard) as { id: number; name: string } | undefined;
      if (!employee) {
        return NextResponse.json({ success: false, error: '员工身份校验失败' }, { status: 401 });
      }
      actorName = employee.name;
    }

    const { action, details, ipAddress, userAgent, source } = body;
    const moduleName = body.module;

    // 来源标识：小程序端显式标记，网页端按 UA 判断
    const fromMiniProgram = source === 'miniprogram' || /micromessenger|miniProgram/i.test(String(userAgent || ''));
    const resolvedDevice = fromMiniProgram
      ? '小程序'
      : (userAgent || null);

    // 参数映射：details -> description
    const description = typeof details === 'string' ? details : JSON.stringify(details || '');

    query.operationLogs.create.run(
      actorId,
      actorName,
      moduleName,
      action,
      description,
      ipAddress || null,
      resolvedDevice,
      chinaNowSql()
    );

    console.log('操作日志记录成功:', { userId: actorId, userName: actorName, module: moduleName, action });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('记录操作日志失败:', error);
    return NextResponse.json(
      { success: false, error: '记录操作日志失败' },
      { status: 500 }
    );
  }
}
