import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request.headers.get('cookie'));
    if (!user) {
      return NextResponse.json({ success: false, error: '登录已失效，请重新登录' }, { status: 401 });
    }
    const contracts = (query.contracts as any).getAll.all() as any[];
    return NextResponse.json({ contracts });
  } catch (error) {
    console.error('获取合同失败:', error);
    return NextResponse.json({ error: '获取合同失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contract_no, customer_id, customer_name, name, amount, start_date, end_date, status, signatory, content, remark, owner, proof_file, proof_file_name } = body;
    
    (query.contracts as any).create.run(
      contract_no || null, customer_id || null, customer_name || null, name || null, 
      amount || 0, start_date || null, end_date || null, status || '草稿', 
      signatory || null, content || null, remark || null, owner || null,
      proof_file || null, proof_file_name || null
    );
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('创建合同失败:', error);
    return NextResponse.json({ error: '创建合同失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { contract_no, customer_id, customer_name, name, amount, start_date, end_date, status, signatory, content, remark, owner, proof_file, proof_file_name } = body;
    
    const pathname = request.nextUrl.pathname;
    const match = pathname.match(/\/api\/contracts\/(\d+)/);
    const id = match ? parseInt(match[1]) : null;
    
    if (!id) {
      return NextResponse.json({ error: '缺少合同ID' }, { status: 400 });
    }
    
    (query.contracts as any).update.run(
      contract_no || null, customer_id || null, customer_name || null, name || null, 
      amount || 0, start_date || null, end_date || null, status || '草稿', 
      signatory || null, content || null, remark || null, owner || null,
      proof_file || null, proof_file_name || null,
      id
    );
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新合同失败:', error);
    return NextResponse.json({ error: '更新合同失败' }, { status: 500 });
  }
}
