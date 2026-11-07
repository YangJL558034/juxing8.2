import { NextRequest, NextResponse } from 'next/server';
import { db, query } from '@/lib/database';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

type CellValue = string | number | boolean | Date | null | undefined;

type AttendanceRecord = {
  employeeId: string;
  name: string;
  department: string;
  year: number;
  month: number;
  attendance: Record<string, string>;
};

type LocationKey = 'office' | 'workshop';

type TemplateKind = 'office' | 'workshop' | 'legacy';

type EmployeeRow = {
  id: number;
  name: string;
  department?: string | null;
  status?: string | null;
  location?: string | null;
};

type MonthlyRecordRow = {
  id: number;
};

type ImportResult = {
  importedEmployees: number;
  importedPunchDays: number;
  importedPunchTimes: number;
  skippedMissing: number;
  skippedIneligible: number;
  employees: Array<{ id: number; name: string; department: string; location: string }>;
  records: Array<{
    name: string;
    employeeId: string;
    department: string;
    year: number;
    month: number;
    normalHours: number;
    overtimeHours: number;
    workDays: number;
    punchDays: number;
    punchTimes: number;
  }>;
  skipped: Array<{ name: string; reason: string; status?: string; location?: string }>;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath: inputFilePath, location } = body;

    console.log('[Attendance Import] 收到导入请求:', { filePath: inputFilePath, location });

    if (!inputFilePath || !existsSync(inputFilePath)) {
      console.error('[Attendance Import] 文件不存在:', inputFilePath);
      return NextResponse.json({ error: '文件不存在' }, { status: 400 });
    }

    const fileName = path.basename(inputFilePath);
    const fileBuffer = await readFile(inputFilePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const templateKind = detectTemplateKind(workbook);
    const locationKey = resolveLocationKey(location, fileName, templateKind);
    const importLocation = displayLocation(locationKey);
    // ⚠️ 不能直接用 SheetNames[0]：考勤机导出的文件常带一张陈旧的副本表
    // （例如名为 "1" 的表，姓名可能还是离职人员），读错表会导致
    // 在职员工被漏掉、或把别人的打卡算到错误的人头上。
    const sheetName = pickImportSheet(workbook, templateKind);
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return NextResponse.json({ error: '未找到可导入的工作表' }, { status: 400 });
    }

    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as CellValue[][];

    const defaults = extractYearMonth(fileName, jsonData);
    if (!defaults) {
      return NextResponse.json({
        error: '未识别打卡月份，请检查文件名或考勤日期是否包含年份和月份',
        sheetName,
      }, { status: 400 });
    }

    const records = parseExcelAttendance(jsonData, defaults.year, defaults.month, templateKind);

    if (records.length === 0) {
      return NextResponse.json({
        error: '未能解析到打卡记录，请检查文件格式',
        sheetName,
        rowCount: jsonData.length,
      }, { status: 400 });
    }

    const result = importAttendanceRecords(records, locationKey);

    if (result.importedEmployees === 0) {
      return NextResponse.json({
        error: `未导入任何员工：员工管理中没有匹配的${importLocation}在职员工`,
        data: {
          year: defaults.year,
          month: defaults.month,
          location: importLocation,
          sheetName,
          parsed: records.length,
          imported: 0,
          skippedMissing: result.skippedMissing,
          skippedIneligible: result.skippedIneligible,
          skipped: result.skipped,
        },
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${result.importedEmployees} 名${importLocation}在职员工，${result.importedPunchDays} 天打卡记录，${result.importedPunchTimes} 个打卡时间；跳过 ${result.skippedMissing + result.skippedIneligible} 名`,
      data: {
        year: defaults.year,
        month: defaults.month,
        location: importLocation,
        sheetName,
        parsed: records.length,
        imported: result.importedEmployees,
        punchDays: result.importedPunchDays,
        punchTimes: result.importedPunchTimes,
        skippedMissing: result.skippedMissing,
        skippedIneligible: result.skippedIneligible,
        total: result.importedEmployees,
        employees: result.employees,
        records: result.records,
        skipped: result.skipped,
      },
    });
  } catch (error) {
    console.error('Import attendance error:', error);
    return NextResponse.json({ error: '导入失败: ' + (error as Error).message }, { status: 500 });
  }
}

function detectTemplateKind(workbook: XLSX.WorkBook): TemplateKind {
  if (workbook.SheetNames.includes('考勤记录')) {
    return 'workshop';
  }

  const firstSheetName = workbook.SheetNames[0] || '';
  const firstSheet = workbook.Sheets[firstSheetName];
  if (normalizeText(firstSheetName).includes('员工刷卡记录表') || firstSheetName.includes('刷卡')) {
    return 'office';
  }

  if (firstSheet) {
    const preview = XLSX.utils.sheet_to_json(firstSheet, {
      header: 1,
      defval: '',
      raw: false,
      range: 0,
    }) as CellValue[][];
    const text = preview.slice(0, 10).map((row) => row.map(cellText).join('')).join('');
    // 导出表标题常带空格（"员 工 刷 卡 记 录 表"），必须去掉空白后再匹配，
    // 否则会误判成 legacy 模板
    if (normalizeText(text).includes('员工刷卡记录表')) {
      return 'office';
    }
  }

  return 'legacy';
}

/**
 * 选择要导入的工作表：
 * 1. 车间模板固定用「考勤记录」
 * 2. 优先取明确命名的「员工刷卡记录表」——文件里若混有陈旧副本表（如名为 "1" 的表），
 *    只有这张表反映的是最新在职人员
 * 3. 都没有时退回第一张表，兼容老格式文件
 */
function pickImportSheet(workbook: XLSX.WorkBook, templateKind: TemplateKind): string {
  const names = workbook.SheetNames;
  if (templateKind === 'workshop' && names.includes('考勤记录')) {
    return '考勤记录';
  }
  const named = names.find((name) => normalizeText(name).includes('员工刷卡记录表'));
  if (named) {
    return named;
  }
  const swipe = names.find((name) => name.includes('刷卡'));
  if (swipe) {
    return swipe;
  }
  return names[0];
}

function resolveLocationKey(input: unknown, fileName: string, templateKind: TemplateKind): LocationKey {
  if (templateKind === 'office' || templateKind === 'workshop') {
    return templateKind;
  }

  const value = typeof input === 'string' ? input.trim() : '';
  if (value === '办公室' || value === 'office') {
    return 'office';
  }
  if (value === '车间' || value === 'workshop') {
    return 'workshop';
  }
  return fileName.includes('车间') ? 'workshop' : 'office';
}

function displayLocation(locationKey: LocationKey) {
  return locationKey === 'office' ? '办公室' : '车间';
}

function locationAliases(locationKey: LocationKey): [string, string] {
  return locationKey === 'office' ? ['office', '办公室'] : ['workshop', '车间'];
}

function extractYearMonth(fileName: string, data: CellValue[][]) {
  const fromName = fileName.match(/(\d{4})年\s*(\d{1,2})月?/);
  if (fromName) {
    return { year: parseInt(fromName[1], 10), month: parseInt(fromName[2], 10) };
  }

  const fromCompactName = fileName.match(/(20\d{2})(0[1-9]|1[0-2])月?/);
  if (fromCompactName) {
    return { year: parseInt(fromCompactName[1], 10), month: parseInt(fromCompactName[2], 10) };
  }

  for (const row of data.slice(0, 20)) {
    const rowText = row.map(cellText).join(' ');
    const fromDateRange = rowText.match(/(\d{4})-(\d{1,2})-\d{1,2}/);
    if (fromDateRange) {
      return {
        year: parseInt(fromDateRange[1], 10),
        month: parseInt(fromDateRange[2], 10),
      };
    }

    const fromText = rowText.match(/(\d{4})年\s*(\d{1,2})月?/);
    if (fromText) {
      return { year: parseInt(fromText[1], 10), month: parseInt(fromText[2], 10) };
    }

    const fromCompactText = rowText.match(/(20\d{2})(0[1-9]|1[0-2])月?/);
    if (fromCompactText) {
      return { year: parseInt(fromCompactText[1], 10), month: parseInt(fromCompactText[2], 10) };
    }
  }

  return null;
}

function parseExcelAttendance(data: CellValue[][], year: number, month: number, templateKind: TemplateKind) {
  if (templateKind === 'workshop') {
    return parseWorkshopAttendanceSheet(data, year, month);
  }
  if (templateKind === 'office') {
    return parseOfficeSwipeSheet(data, year, month);
  }

  const officeRows = parseOfficeSwipeSheet(data, year, month);
  return officeRows.length > 0 ? officeRows : parseWorkshopAttendanceSheet(data, year, month);
}

function parseWorkshopAttendanceSheet(data: CellValue[][], year: number, month: number) {
  const records: AttendanceRecord[] = [];
  const dayHeaderIndex = data.findIndex((row) => getDayColumns(row).size >= 15);
  if (dayHeaderIndex < 0) {
    return records;
  }

  const dayColumns = getDayColumns(data[dayHeaderIndex]);

  for (let i = dayHeaderIndex + 1; i < data.length - 1; i++) {
    const infoRow = data[i];
    if (!isEmployeeInfoRow(infoRow)) {
      continue;
    }

    const name = findLabeledValue(infoRow, '姓名');
    if (!name) {
      continue;
    }

    const employeeId = findLabeledValue(infoRow, '工号');
    const department = findLabeledValue(infoRow, '部门') || '';
    const punchRow = data[i + 1] || [];
    const attendance: Record<string, string> = {};

    for (const [columnIndex, day] of dayColumns.entries()) {
      const times = extractPunchTimes(cellText(punchRow[columnIndex]));
      if (times.length > 0) {
        attendance[String(day)] = times.join('\n');
      }
    }

    if (Object.keys(attendance).length > 0) {
      records.push({
        employeeId,
        name,
        department,
        year,
        month,
        attendance,
      });
    }
  }

  return records;
}

function parseOfficeSwipeSheet(data: CellValue[][], year: number, month: number) {
  const records: AttendanceRecord[] = [];

  for (let i = 0; i < data.length - 2; i++) {
    const infoRow = data[i];
    if (!isEmployeeInfoRow(infoRow)) {
      continue;
    }

    const dayColumns = getDayColumns(data[i + 1]);
    if (dayColumns.size === 0) {
      continue;
    }

    const name = findLabeledValue(infoRow, '姓名');
    if (!name) {
      continue;
    }

    const employeeId = findLabeledValue(infoRow, '工号');
    const department = findLabeledValue(infoRow, '部门') || '';
    const punchRow = data[i + 2] || [];
    const attendance: Record<string, string> = {};

    for (const [columnIndex, day] of dayColumns.entries()) {
      const times = extractPunchTimes(cellText(punchRow[columnIndex]));
      if (times.length > 0) {
        attendance[String(day)] = times.join('\n');
      }
    }

    if (Object.keys(attendance).length > 0) {
      records.push({
        employeeId,
        name,
        department,
        year,
        month,
        attendance,
      });
      i += 2;
    }
  }

  return records;
}

function getDayColumns(row: CellValue[] = []) {
  const columns = new Map<number, number>();
  row.forEach((cell, index) => {
    const value = cellText(cell);
    if (/^\d{1,2}$/.test(value)) {
      const day = parseInt(value, 10);
      if (day >= 1 && day <= 31) {
        columns.set(index, day);
      }
    }
  });
  return columns;
}

function isEmployeeInfoRow(row: CellValue[] = []) {
  const normalized = normalizeText(row.map(cellText).join(''));
  return normalized.includes('工号') && normalized.includes('姓名');
}

function findLabeledValue(row: CellValue[], label: '工号' | '姓名' | '部门') {
  for (let i = 0; i < row.length; i++) {
    if (!normalizeText(cellText(row[i])).includes(label)) {
      continue;
    }

    for (let j = i + 1; j < Math.min(i + 8, row.length); j++) {
      const value = cellText(row[j]);
      if (value && !isInfoLabel(value)) {
        return value;
      }
    }
  }
  return '';
}

function isInfoLabel(value: string) {
  const normalized = normalizeText(value);
  return ['工号', '姓名', '部门', '日期', '制表时间', '考勤时间'].some((label) => normalized.includes(label));
}

function extractPunchTimes(value: string) {
  const matches = value.replace(/：/g, ':').match(/\d{1,2}:\d{2}/g) || [];
  const seen = new Set<string>();
  const times: string[] = [];

  for (const match of matches) {
    const parsed = parseTime(match);
    if (parsed === null) {
      continue;
    }

    const normalized = formatMinutes(parsed);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      times.push(normalized);
    }
  }

  return times.sort();
}

function importAttendanceRecords(records: AttendanceRecord[], locationKey: LocationKey): ImportResult {
  let importedEmployees = 0;
  let importedPunchDays = 0;
  let importedPunchTimes = 0;
  let skippedMissing = 0;
  let skippedIneligible = 0;
  const employees: ImportResult['employees'] = [];
  const recordDetails: ImportResult['records'] = [];
  const skipped: ImportResult['skipped'] = [];

  const importLocation = displayLocation(locationKey);
  const aliases = locationAliases(locationKey);
  const getEligibleEmployee = db.prepare(`
    SELECT * FROM employees
    WHERE name = ? AND location IN (?, ?) AND status = '在职'
    LIMIT 1
  `);
  const getEmployeeByName = db.prepare('SELECT * FROM employees WHERE name = ? LIMIT 1');
  const getExistingMonthlyRecord = db.prepare(`
    SELECT * FROM work_hours_monthly
    WHERE employee_id = ? AND year = ? AND month_num = ?
    LIMIT 1
  `);
  const updateMonthlyRecord = db.prepare(`
    UPDATE work_hours_monthly SET
      employee_name = ?,
      normal_hours = ?,
      weekday_overtime = ?,
      work_hours = ?,
      overtime_hours = ?,
      total_days = ?,
      details = ?,
      location = ?
    WHERE id = ?
  `);

  for (const record of records) {
    const employee = getEligibleEmployee.get(record.name, aliases[0], aliases[1]) as EmployeeRow | undefined;

    if (!employee) {
      const existingEmployee = getEmployeeByName.get(record.name) as EmployeeRow | undefined;
      if (existingEmployee) {
        skippedIneligible++;
        skipped.push({
          name: record.name,
          reason: `员工不是${importLocation}在职员工`,
          status: existingEmployee.status ?? undefined,
          location: existingEmployee.location ?? undefined,
        });
      } else {
        skippedMissing++;
        skipped.push({ name: record.name, reason: '员工管理中不存在该员工' });
      }
      continue;
    }

    const calculated = calculateAttendanceHours(record.attendance);
    const monthStr = `${record.year}-${String(record.month).padStart(2, '0')}`;
    const details = JSON.stringify(record.attendance);
    const existingRecord = getExistingMonthlyRecord.get(employee.id, record.year, record.month) as MonthlyRecordRow | undefined;

    if (existingRecord) {
      updateMonthlyRecord.run(
        record.name,
        calculated.normalHours,
        calculated.overtimeHours,
        calculated.normalHours + calculated.overtimeHours,
        calculated.overtimeHours,
        calculated.workDays,
        details,
        importLocation,
        existingRecord.id,
      );
    } else {
      query.createWorkHoursMonthly.run(
        employee.id,
        monthStr,
        calculated.workDays,
        calculated.normalHours + calculated.overtimeHours,
        calculated.overtimeHours,
        0,
        details,
        record.name,
        record.year,
        record.month,
        calculated.normalHours,
        calculated.overtimeHours,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        importLocation,
      );
    }

    importedEmployees++;
    importedPunchDays += calculated.punchDays;
    importedPunchTimes += calculated.punchTimes;
    employees.push({
      id: employee.id,
      name: record.name,
      department: employee.department || record.department || '',
      location: importLocation,
    });
    recordDetails.push({
      name: record.name,
      employeeId: record.employeeId,
      department: employee.department || record.department || '',
      year: record.year,
      month: record.month,
      normalHours: roundHours(calculated.normalHours),
      overtimeHours: roundHours(calculated.overtimeHours),
      workDays: calculated.workDays,
      punchDays: calculated.punchDays,
      punchTimes: calculated.punchTimes,
    });
  }

  return {
    importedEmployees,
    importedPunchDays,
    importedPunchTimes,
    skippedMissing,
    skippedIneligible,
    employees,
    records: recordDetails,
    skipped,
  };
}

function calculateAttendanceHours(attendance: Record<string, string>) {
  let normalHours = 0;
  let overtimeHours = 0;
  let workDays = 0;
  let punchDays = 0;
  let punchTimes = 0;

  for (const value of Object.values(attendance)) {
    const times = extractPunchTimes(value);
    if (times.length === 0) {
      continue;
    }

    punchDays++;
    punchTimes += times.length;

    if (times.length < 2) {
      continue;
    }

    const startTime = parseTime(times[0]);
    const endTime = parseTime(times[times.length - 1]);
    if (startTime === null || endTime === null) {
      continue;
    }

    let minutes = endTime - startTime;
    if (minutes < 0) {
      minutes += 24 * 60;
    }

    let hours = minutes / 60;
    if (hours > 4) {
      hours -= 1.5;
    }

    if (hours <= 0) {
      continue;
    }

    workDays++;
    if (hours <= 8) {
      normalHours += hours;
    } else {
      normalHours += 8;
      overtimeHours += hours - 8;
    }
  }

  return {
    normalHours: roundHours(normalHours),
    overtimeHours: roundHours(overtimeHours),
    workDays,
    punchDays,
    punchTimes,
  };
}

function parseTime(timeStr: string) {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

function formatMinutes(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function roundHours(hours: number) {
  return Math.round(hours * 10) / 10;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, '').replace(/[:：]/g, '');
}

function cellText(value: CellValue) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    const records = year && month
      ? query.getWorkHoursMonthlyByYearMonth.all(parseInt(year, 10), parseInt(month, 10))
      : query.getWorkHoursMonthly.all();

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error('Get attendance error:', error);
    return NextResponse.json({ error: '获取打卡记录失败' }, { status: 500 });
  }
}
