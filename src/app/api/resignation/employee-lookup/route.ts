import { NextRequest, NextResponse } from 'next/server';
import { isCompleteIdCard } from '@/lib/identity-validation';
import { findResignationEmployee } from '@/lib/resignation-employee';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body?.name || '').trim();
    const idCard = String(body?.idCard || '').trim();
    if (!name || !isCompleteIdCard(idCard)) {
      return NextResponse.json({ success: false, error: '请输入姓名和完整身份证号码' }, { status: 400 });
    }

    const employee = findResignationEmployee(name, idCard);
    if (!employee) {
      return NextResponse.json({ success: false, error: '未找到匹配的已审核在职入职记录，请核对姓名和身份证号码' }, { status: 404 });
    }
    return NextResponse.json({ success: true, employee });
  } catch (error) {
    console.error('Lookup resignation employee error:', error);
    return NextResponse.json({ success: false, error: '查询入职信息失败' }, { status: 500 });
  }
}
