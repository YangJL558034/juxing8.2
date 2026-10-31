import { NextRequest, NextResponse } from 'next/server';
import { db, query } from '@/lib/database';
import { isCompleteIdCard, normalizeIdCard } from '@/lib/identity-validation';
import { issueEmployeeToken, revokeEmployeeToken } from '@/lib/employee-session';
import { code2Session } from '@/lib/wechat';

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
 * 员工登录：姓名 + 身份证校验一次，签发 30 天有效的 token。
 * 之后的接口都用 X-Employee-Token 识别身份，不再把身份证放在 URL 上。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const name = String((body as Record<string, unknown>)?.name || '').trim();
    const idCard = normalizeIdCard(String((body as Record<string, unknown>)?.idCard || ''));
    // 可选：带上 wx.login 的 code，登录成功时顺便绑定 openid，下次可一键登录
    const wxCode = String((body as Record<string, unknown>)?.code || '').trim();

    if (!name) {
      return NextResponse.json({ success: false, error: '请输入姓名' }, { status: 400 });
    }
    if (!isCompleteIdCard(idCard)) {
      return NextResponse.json({ success: false, error: '身份证号格式不正确' }, { status: 400 });
    }

    const employee = query.getEmployeeByNameAndIdCard.get(name, idCard) as EmployeeRow | undefined;
    if (!employee) {
      return NextResponse.json({ success: false, error: '员工信息验证失败，请确认姓名和身份证号是否正确' }, { status: 401 });
    }
    if (['离职', '已离职'].includes(String(employee.status || ''))) {
      return NextResponse.json({ success: false, error: '该员工已离职，无法登录' }, { status: 403 });
    }

    const token = issueEmployeeToken(employee.id);

    // 绑定微信 openid：之后同一微信可直接一键登录
    let wxBound = false;
    if (wxCode) {
      const wx = await code2Session(wxCode);
      if (wx.openid) {
        try {
          // 一个 openid 只保留最新绑定，避免换号后旧档案还绑着
          db.prepare('UPDATE employees SET wx_openid = NULL WHERE wx_openid = ? AND id <> ?').run(wx.openid, employee.id);
          db.prepare('UPDATE employees SET wx_openid = ? WHERE id = ?').run(wx.openid, employee.id);
          wxBound = true;
        } catch (bindError) {
          console.error('Bind wx_openid failed:', bindError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      token,
      wxBound,
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
    console.error('Employee session login error:', error);
    return NextResponse.json({ success: false, error: '登录失败，请稍后重试' }, { status: 500 });
  }
}

/** 退出登录：吊销当前 token */
export async function DELETE(request: NextRequest) {
  try {
    revokeEmployeeToken(request);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Employee session logout error:', error);
    return NextResponse.json({ success: false, error: '退出失败' }, { status: 500 });
  }
}
