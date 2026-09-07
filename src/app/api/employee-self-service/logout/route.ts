import { NextRequest, NextResponse } from 'next/server';
import { clearEmployeeSession } from '@/lib/employee-session';
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  clearEmployeeSession(request, response);
  return response;
}
