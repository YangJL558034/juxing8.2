import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { code2Session } from '@/lib/wechat';
import { issueEmployeeToken } from '@/lib/employee-session';

interface EmployeeRow {
  id: number;
  name: string;
  id_card: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  status: string | null;
  hire_date: string | null;
  location: string | null;
  wx_openid: string | null;
}

function maskIdCard(value: string | null | undefined) {
  const text = String(value || '').trim();
  if (text.length < 10) return text ? '****' : '';
  return `${text.slice(0, 6)}********${text.slice(-4)}`;
}

function maskPhone(value: string | null | undefined) {
  const text = String(value || '').trim();
  if (text.length < 7) return text;
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

/**
 * 微信一键登录：wx.login 的 code → openid → 查已绑定的员工。
 * 只有在职且已建档、且绑定过 openid 的员工才会直接返回 token；
 * 其余情况返回 bound=false，让前端回退到「姓名+身份证」登录。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const code = String((body as Record<string, unknown>)?.code || '').trim();
    if (!code) {
      return NextResponse.json({ success: false, bound: false, error: '缺少登录 code' }, { status: 400 });
    }

    const wx = await code2Session(code);
    if (!wx.openid) {
      return NextResponse.json({
        success: true,
        bound: false,
        // 密钥错误 / 未配置 / 接口异常 都属于「服务不可用」，要和「未绑定」区分开
        unavailable: true,
        notConfigured: Boolean(wx.notConfigured),
        error: wx.error,
      });
    }

    const employee = db.prepare(`
      SELECT id, name, id_card, phone, department, position, status, hire_date, location, wx_openid
      FROM employees WHERE wx_openid = ?
    `).get(wx.openid) as EmployeeRow | undefined;

    if (!employee || ['离职', '已离职'].includes(String(employee.status || ''))) {
      return NextResponse.json({
        success: true,
        bound: false,
        reason: employee ? 'resigned' : 'not_bound',
      });
    }

    const token = issueEmployeeToken(employee.id);
    return NextResponse.json({
      success: true,
      bound: true,
      token,
      expiresIn: 30 * 86400,
      employee: {
        id: employee.id,
        name: employee.name,
        department: employee.department || '',
        position: employee.position || '',
        status: employee.status || '在职',
        hireDate: employee.hire_date || '',
        location: employee.location || '',
        idCardMasked: maskIdCard(employee.id_card),
        phoneMasked: maskPhone(employee.phone),
      },
    });
  } catch (error) {
    console.error('WeChat login error:', error);
    return NextResponse.json({ success: false, bound: false, error: '微信登录失败' }, { status: 500 });
  }
}
