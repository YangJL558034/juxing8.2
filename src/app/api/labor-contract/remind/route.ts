import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { findOverdueContracts, runContractReminderCheck } from '@/lib/contract-reminder';

async function requireUser(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** 手动触发劳动合同超期检查；?dryRun=1 只返回名单不发邮件 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    if (request.nextUrl.searchParams.get('dryRun') === '1') {
      const rows = findOverdueContracts();
      return NextResponse.json({ success: true, dryRun: true, count: rows.length, records: rows });
    }

    const result = await runContractReminderCheck();
    return NextResponse.json({
      success: true,
      sent: result.sent,
      count: result.count,
      error: result.error,
      message: result.sent
        ? `已发送提醒邮件（涉及 ${result.count} 人）`
        : result.count === 0
          ? '没有超期未登记劳动合同的员工'
          : (result.error || '邮件发送失败'),
    });
  } catch (error) {
    console.error('Contract reminder error:', error);
    return NextResponse.json({ success: false, error: '执行失败' }, { status: 500 });
  }
}
