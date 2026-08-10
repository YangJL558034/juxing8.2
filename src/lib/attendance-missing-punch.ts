import type { LeaveRequestRecord } from '@/types/leave-request';

export const STANDARD_CHECK_IN_TIME = '08:30';
export const STANDARD_CHECK_OUT_TIME = '17:30';

export type MissingPunchPeriod = 'check-in' | 'check-out';

export interface AttendanceSchedule {
  checkInTime: string;
  checkOutTime: string;
}

export interface MissingPunchReminder extends AttendanceSchedule {
  date: string;
  missingPeriods: MissingPunchPeriod[];
  missingTimes: string[];
}

function toMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function normalizeTime(value: string | null | undefined, fallback: string): string {
  const minutes = value ? toMinutes(value) : null;
  if (minutes === null) return fallback;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function normalizeAttendanceSchedule(
  checkInTime?: string | null,
  checkOutTime?: string | null,
): AttendanceSchedule {
  const normalizedCheckIn = normalizeTime(checkInTime, STANDARD_CHECK_IN_TIME);
  const normalizedCheckOut = normalizeTime(checkOutTime, STANDARD_CHECK_OUT_TIME);
  const checkInMinutes = toMinutes(normalizedCheckIn) ?? 0;
  const checkOutMinutes = toMinutes(normalizedCheckOut) ?? 0;

  if (checkInMinutes >= checkOutMinutes) {
    return {
      checkInTime: STANDARD_CHECK_IN_TIME,
      checkOutTime: STANDARD_CHECK_OUT_TIME,
    };
  }

  return { checkInTime: normalizedCheckIn, checkOutTime: normalizedCheckOut };
}

export function extractAttendanceTimes(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split('\n').map((time) => time.trim()).filter(Boolean);
  }
  if (value && typeof value === 'object' && Array.isArray((value as { times?: unknown }).times)) {
    return (value as { times: unknown[] }).times
      .map((time) => String(time).trim())
      .filter(Boolean);
  }
  return [];
}

export function isExpectedAttendanceDate(date: string, hireDate?: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (hireDate && /^\d{4}-\d{2}-\d{2}$/.test(hireDate) && date < hireDate) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getUTCDay() !== 0;
}

export function getMissingPunchPeriods({
  date,
  times,
  leaves,
  today,
  currentTime,
  checkInTime,
  checkOutTime,
}: {
  date: string;
  times: string[];
  leaves: LeaveRequestRecord[];
  today: string;
  currentTime: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}): MissingPunchPeriod[] {
  if (!today || date > today) return [];

  const schedule = normalizeAttendanceSchedule(checkInTime, checkOutTime);
  const approvedLeaves = leaves.filter((leave) => leave.status === '已审核');
  if (approvedLeaves.some((leave) => leave.duration === 'full')) return [];

  const morningExempt = approvedLeaves.some((leave) =>
    leave.duration === 'half' && leave.halfDayPeriod.includes('上午')
  );
  const afternoonExempt = approvedLeaves.some((leave) =>
    leave.duration === 'half' && leave.halfDayPeriod.includes('下午')
  );

  const minutes = times.map(toMinutes).filter((minute): minute is number => minute !== null);
  const checkOutMinutes = toMinutes(schedule.checkOutTime) ?? 17 * 60 + 30;
  const hasCheckIn = minutes.some((minute) => minute < 12 * 60);
  // 下班时间及之后的任意一次打卡都算有效下班卡，例如 17:30 下班时，20:01 仍算下班卡。
  const hasCheckOut = minutes.some((minute) => minute >= checkOutMinutes);
  const checkInDue = date < today || currentTime >= schedule.checkInTime;
  const checkOutDue = date < today || currentTime >= schedule.checkOutTime;
  const missing: MissingPunchPeriod[] = [];

  if (!morningExempt && checkInDue && !hasCheckIn) missing.push('check-in');
  if (!afternoonExempt && checkOutDue && !hasCheckOut) missing.push('check-out');
  return missing;
}

export function missingPunchTime(
  period: MissingPunchPeriod,
  schedule?: Partial<AttendanceSchedule>,
) {
  const normalized = normalizeAttendanceSchedule(schedule?.checkInTime, schedule?.checkOutTime);
  return period === 'check-in' ? normalized.checkInTime : normalized.checkOutTime;
}

export function missingPunchLabel(
  period: MissingPunchPeriod,
  schedule?: Partial<AttendanceSchedule>,
) {
  return period === 'check-in'
    ? `上班卡 ${missingPunchTime(period, schedule)}`
    : `下班卡 ${missingPunchTime(period, schedule)}`;
}

export function createMissingPunchReminder(
  date: string,
  missingPeriods: MissingPunchPeriod[],
  checkInTime?: string | null,
  checkOutTime?: string | null,
): MissingPunchReminder {
  const schedule = normalizeAttendanceSchedule(checkInTime, checkOutTime);
  return {
    date,
    ...schedule,
    missingPeriods,
    missingTimes: missingPeriods.map((period) => missingPunchTime(period, schedule)),
  };
}
