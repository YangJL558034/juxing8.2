import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';

// 添加或修改打卡记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, employeeName, date, time, note, action } = body;

    if (!employeeId || !employeeName || !date || !time) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    // 如果是修改操作，必须有备注
    if (action === 'modify' && !note?.trim()) {
      return NextResponse.json({ success: false, error: '修改打卡记录必须填写备注' }, { status: 400 });
    }

    // 解析日期获取年月
    const [yearStr, monthStr] = date.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);

    // 查找该员工当月的工时记录
    const monthlyRecords = db.prepare(
      `SELECT * FROM work_hours_monthly WHERE employee_id = ? AND year = ? AND month_num = ?`
    ).all(employeeId, year, monthNum) as any[];

    if (!monthlyRecords || monthlyRecords.length === 0) {
      return NextResponse.json({ success: false, error: '未找到当月工时记录' }, { status: 404 });
    }

    const monthlyRecord = monthlyRecords[0];

    // 解析现有的打卡数据
    let details: any = {};
    if (monthlyRecord.details) {
      try {
        details = JSON.parse(monthlyRecord.details);
      } catch (e) {
        details = {};
      }
    }

    // 获取日期（不含年月），转为数字去掉前导零
    const day = parseInt(date.split('-')[2], 10).toString();

    // 获取当天现有的打卡时间
    let dayTimes = details[day] || '';
    const timeList = dayTimes ? dayTimes.split('\n').filter((t: string) => t.trim()) : [];

    // 构建新的时间字符串
    let newTimeStr = time;
    if (note?.trim()) {
      newTimeStr = `${time}（${note.trim()}）`;
    }

    // 添加新的打卡时间
    timeList.push(newTimeStr);

    // 按时间排序
    timeList.sort((a: string, b: string) => {
      const timeA = a.split('（')[0].trim();
      const timeB = b.split('（')[0].trim();
      return timeA.localeCompare(timeB);
    });

    // 更新 details
    details[day] = timeList.join('\n');

    // 保存到数据库
    db.prepare(
      `UPDATE work_hours_monthly SET details = ? WHERE id = ?`
    ).run(JSON.stringify(details), monthlyRecord.id);

    return NextResponse.json({
      success: true,
      message: '打卡记录已更新',
      data: {
        date,
        time: newTimeStr,
        dayTimes: details[day]
      }
    });
  } catch (error) {
    console.error('修改打卡记录失败:', error);
    return NextResponse.json({ success: false, error: '修改打卡记录失败' }, { status: 500 });
  }
}

// 删除打卡记录
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const date = searchParams.get('date');
    const time = searchParams.get('time');

    if (!employeeId || !date || !time) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    // 解析日期获取年月
    const [yearStr, monthStr] = date.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);

    // 查找该员工当月的工时记录
    const monthlyRecords = db.prepare(
      `SELECT * FROM work_hours_monthly WHERE employee_id = ? AND year = ? AND month_num = ?`
    ).all(employeeId, year, monthNum) as any[];

    if (!monthlyRecords || monthlyRecords.length === 0) {
      return NextResponse.json({ success: false, error: '未找到当月工时记录' }, { status: 404 });
    }

    const monthlyRecord = monthlyRecords[0];

    // 解析现有的打卡数据
    let details: any = {};
    if (monthlyRecord.details) {
      try {
        details = JSON.parse(monthlyRecord.details);
      } catch (e) {
        details = {};
      }
    }

    // 获取日期（不含年月），去掉前导零
    // 必须与 POST（添加补卡）和导入接口的 key 规则保持一致，
    // 否则 details["05"] 永远匹配不到实际存储的 details["5"]，
    // 删除会变成空操作（接口返回成功但数据没变）
    const day = parseInt(date.split('-')[2], 10).toString();
    const paddedDay = date.split('-')[2];

    // 兼容历史数据中可能存在的前导零 key
    let dayTimes = details[day] ?? details[paddedDay] ?? '';
    const timeList = dayTimes ? dayTimes.split('\n').filter((t: string) => t.trim()) : [];

    // 删除指定时间（记录可能带“（备注）”后缀，比较时只取时间部分）
    const updatedList = timeList.filter((t: string) => {
      const timePart = t.split('（')[0].trim();
      return timePart !== time;
    });

    // 更新 details，统一写回无前导零的 key
    if (updatedList.length > 0) {
      details[day] = updatedList.join('\n');
    } else {
      delete details[day];
    }
    // 清理历史前导零 key，避免脏数据残留
    if (paddedDay !== day) {
      delete details[paddedDay];
    }

    // 保存到数据库
    db.prepare(
      `UPDATE work_hours_monthly SET details = ? WHERE id = ?`
    ).run(JSON.stringify(details), monthlyRecord.id);

    return NextResponse.json({
      success: true,
      message: '打卡记录已删除'
    });
  } catch (error) {
    console.error('删除打卡记录失败:', error);
    return NextResponse.json({ success: false, error: '删除打卡记录失败' }, { status: 500 });
  }
}
