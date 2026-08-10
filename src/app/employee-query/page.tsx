'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { chinaCurrentMonth, formatChinaDate } from '@/lib/china-time';
import {
  formatAttendanceLeaveLabel,
  isDateInLeaveRange,
} from '@/lib/leave-records';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, 
  Clock, 
  Timer, 
  Wallet,
  User,
  Fingerprint,
  Building2,
  MapPin,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  ReceiptText,
  CreditCard,
  CircleDollarSign,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Maximize2,
  Minimize2,
  X
} from 'lucide-react';
import { logOperation, LogModules, LogActions } from '@/lib/log';
import { missingPunchLabel, type MissingPunchReminder } from '@/lib/attendance-missing-punch';
import type { LeaveRequestRecord } from '@/types/leave-request';

interface Employee {
  id: number;
  name: string;
  id_card: string;
  phone: string;
  department: string;
  position: string;
  base_salary: number;
  status: string;
  location: string;
  attendance_check_in_time?: string | null;
  attendance_check_out_time?: string | null;
}

interface AttendanceRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  date: string;
  time: string;
  location: string;
  created_at: string;
}

interface SalaryRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  month: string;
  year: number;
  month_num: number;
  base_salary: number;
  normal_hours: number;
  weekday_overtime: number;
  weekend_overtime: number;
  normal_pay: number;
  weekday_overtime_pay: number;
  weekend_overtime_pay: number;
  living_subsidy: number;
  seniority_award: number;
  full_attendance_award: number;
  position_subsidy: number;
  social_security_subsidy: number;
  total_payable: number;
  deduct_social_security: number;
  deduct_utilities: number;
  total_deduction: number;
  actual_amount: number;
  signature?: string;
  signature_time?: string;
  location: string;
  bank_account?: string;
  remark?: string;
  department?: string;
  employee_code?: string;
  // 办公室格式扣除项
  housing_fund?: number;
  social_insurance?: number;
  social_pension_adj?: number;
  // 办公室格式考勤字段
  should_attend_days?: number;
  saturday_days?: number;
  actual_attend_days?: number;
  paid_leave_days?: number;
  holiday_overtime?: number;
  holiday_pay?: number;
  holiday_overtime_pay?: number;
  // 办公室格式收入字段
  performance_bonus?: number;
  meal_subsidy?: number;
  housing_subsidy?: number;
  transport_subsidy?: number;
  other_subsidy?: number;
  fine?: number;
  other_deduction?: number;
  deduct_loan?: number;
  deduct_urgent?: number;
  deduct_other?: number;
  pre_tax_salary?: number;
  income_tax?: number;
}

// 获取星期几
const getWeekday = (year: number, month: number, day: number): string => {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return weekdays[new Date(year, month - 1, day).getDay()];
};

// 判断是否周末
const isWeekend = (year: number, month: number, day: number): boolean => {
  const dayOfWeek = new Date(year, month - 1, day).getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
};

// 获取月份天数
const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

// 工时计算函数 - 处理多个打卡时间
const calculateWorkHours = (times: string[], isWeekendDay: boolean) => {
  if (!times || times.length === 0) return { normalHours: 0, overtimeHours: 0, totalHours: 0, firstTime: '', lastTime: '' };
  
  // 解析时间字符串为分钟数
  const parseTime = (timeStr: string): number | null => {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  };
  
  // 过滤并解析有效时间
  const validTimes = times
    .map(t => t.replace(/[（(].*?[）)]/g, '').trim()) // 移除备注
    .filter(t => /^\d{1,2}:\d{2}$/.test(t))
    .map(t => parseTime(t))
    .filter(t => t !== null) as number[];
  
  if (validTimes.length === 0) return { normalHours: 0, overtimeHours: 0, totalHours: 0, firstTime: '', lastTime: '' };
  
  validTimes.sort((a, b) => a - b);
  const firstTime = validTimes[0];
  const lastTime = validTimes[validTimes.length - 1];
  
  // 格式化时间
  const formatTime = (minutes: number): string => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };
  
  // 时间点定义（分钟数）
  const WORK_START = 8 * 60;        // 8:00
  const LUNCH_START = 12 * 60;      // 12:00
  const LUNCH_END = 13.5 * 60;      // 13:30
  const WORK_END = 17.5 * 60;       // 17:30
  const DINNER_END = 18 * 60;       // 18:00
  
  // 计算正班工时（8:00-12:00 + 13:30-17:30）
  // 周末也按正常班计算
  let normalMinutes = 0;
  const normalStart = Math.max(firstTime, WORK_START);
  const normalEnd = Math.min(lastTime, WORK_END);
  
  if (normalEnd > normalStart) {
    // 上午工时
    const morningStart = normalStart;
    const morningEnd = Math.min(normalEnd, LUNCH_START);
    if (morningEnd > morningStart) {
      normalMinutes += morningEnd - morningStart;
    }
    // 下午工时
    const afternoonStart = Math.max(normalStart, LUNCH_END);
    const afternoonEnd = normalEnd;
    if (afternoonEnd > afternoonStart) {
      normalMinutes += afternoonEnd - afternoonStart;
    }
  }
  
  // 计算加班工时（18:00以后）
  let overtimeMinutes = 0;
  if (lastTime > DINNER_END) {
    overtimeMinutes = lastTime - DINNER_END;
  }
  
  return {
    normalHours: Math.max(0, normalMinutes / 60),
    overtimeHours: Math.max(0, overtimeMinutes / 60),
    totalHours: Math.max(0, (normalMinutes + overtimeMinutes) / 60),
    firstTime: formatTime(firstTime),
    lastTime: formatTime(lastTime)
  };
};

// 格式化工时显示
const formatWorkHours = (hours: number): string => {
  if (!hours || hours === 0) return '0';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}小时`;
  if (h === 0) return `${m}分钟`;
  return `${h}小时${m}分`;
};

const formatMoney = (value?: number): string => {
  const amount = Number(value ?? 0);
  return `¥${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const hasAmount = (value?: number): boolean => Math.abs(Number(value ?? 0)) > 0;

const normalizeLocationLabel = (value?: string): string => {
  if (value === 'office') return '办公室';
  if (value === 'workshop') return '车间';
  return value || '-';
};

const LAST_EMPLOYEE_QUERY_KEY = 'employee-query:last-identity';
const LAST_EMPLOYEE_QUERY_COOKIE = 'employee_query_last_identity';
const LAST_EMPLOYEE_QUERY_MAX_AGE = 60 * 60 * 24 * 365;

const getPreviousMonthKey = (): string => {
  const [year, month] = chinaCurrentMonth().split('-').map(Number);
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return `${previousYear}-${String(previousMonth).padStart(2, '0')}`;
};

interface SavedEmployeeQuery {
  name: string;
  idCard: string;
}

const maskIdCard = (value: string): string => {
  const text = value.trim();
  if (text.length <= 8) return text;
  return `${text.slice(0, 6)}********${text.slice(-4)}`;
};

const formatSavedQueryLabel = (query: SavedEmployeeQuery): string => {
  const displayName = query.name || '未填写姓名';
  const displayIdCard = query.idCard ? maskIdCard(query.idCard) : '未填写身份证';
  return `${displayName} · ${displayIdCard}`;
};

const normalizeSavedQuery = (value: unknown): SavedEmployeeQuery | null => {
  const data = typeof value === 'object' && value ? value as Partial<SavedEmployeeQuery> : {};
  const savedName = typeof data.name === 'string' ? data.name.trim() : '';
  const savedIdCard = typeof data.idCard === 'string' ? data.idCard.trim() : '';
  if (!savedName && !savedIdCard) return null;
  return { name: savedName, idCard: savedIdCard };
};

const getCookieSecuritySuffix = (): string => (
  window.location.protocol === 'https:' ? '; Secure' : ''
);

const readSavedQueryFromCookie = (): SavedEmployeeQuery | null => {
  const prefix = `${LAST_EMPLOYEE_QUERY_COOKIE}=`;
  const cookie = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!cookie) return null;

  try {
    return normalizeSavedQuery(JSON.parse(decodeURIComponent(cookie.slice(prefix.length))));
  } catch {
    return null;
  }
};

const writeSavedQueryToCookie = (query: SavedEmployeeQuery): void => {
  document.cookie = [
    `${LAST_EMPLOYEE_QUERY_COOKIE}=${encodeURIComponent(JSON.stringify(query))}`,
    `Max-Age=${LAST_EMPLOYEE_QUERY_MAX_AGE}`,
    'Path=/',
    'SameSite=Lax',
  ].join('; ') + getCookieSecuritySuffix();
};

const clearSavedQueryCookie = (): void => {
  document.cookie = [
    `${LAST_EMPLOYEE_QUERY_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'SameSite=Lax',
  ].join('; ') + getCookieSecuritySuffix();
};

export default function EmployeeQueryPage() {
  const [name, setName] = useState('');
  const [idCard, setIdCard] = useState('');
  const [savedQuery, setSavedQuery] = useState<SavedEmployeeQuery | null>(null);
  const [searched, setSearched] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [leaveRecords, setLeaveRecords] = useState<LeaveRequestRecord[]>([]);
  const [missingPunchRecords, setMissingPunchRecords] = useState<MissingPunchReminder[]>([]);
  const [missingPunchDialogOpen, setMissingPunchDialogOpen] = useState(false);
  const [selectedAttendanceMonth, setSelectedAttendanceMonth] = useState('');
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // 筛选状态
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, '0'));
  
  // 签字相关
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signRecordId, setSignRecordId] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canSearch = Boolean(name.trim() && idCard.trim() && idCard.trim().length >= 15);

  const persistSavedQuery = (queryName: string, queryIdCard: string) => {
    const nextSavedQuery: SavedEmployeeQuery = {
      name: queryName.trim(),
      idCard: queryIdCard.trim(),
    };

    if (!nextSavedQuery.name && !nextSavedQuery.idCard) {
      setSavedQuery(null);
      try {
        window.localStorage.removeItem(LAST_EMPLOYEE_QUERY_KEY);
      } catch {
        // 忽略本地存储清理失败。
      }
      try {
        clearSavedQueryCookie();
      } catch {
        // 忽略 Cookie 清理失败。
      }
      return;
    }

    setSavedQuery(nextSavedQuery);
    try {
      window.localStorage.setItem(LAST_EMPLOYEE_QUERY_KEY, JSON.stringify(nextSavedQuery));
      writeSavedQueryToCookie(nextSavedQuery);
    } catch {
      // 浏览器隐私模式可能禁用本地存储，查询本身不受影响。
      try {
        writeSavedQueryToCookie(nextSavedQuery);
      } catch {
        // Cookie 也被禁用时，只保留当前页面内状态。
      }
    }
  };

  useEffect(() => {
    let nextSavedQuery: SavedEmployeeQuery | null = null;

    try {
      const stored = window.localStorage.getItem(LAST_EMPLOYEE_QUERY_KEY);
      nextSavedQuery = stored ? normalizeSavedQuery(JSON.parse(stored)) : null;
      if (!nextSavedQuery && stored) {
        window.localStorage.removeItem(LAST_EMPLOYEE_QUERY_KEY);
      }
    } catch {
      try {
        window.localStorage.removeItem(LAST_EMPLOYEE_QUERY_KEY);
      } catch {
        // 忽略本地存储清理失败。
      }
    }

    if (!nextSavedQuery) {
      try {
        nextSavedQuery = readSavedQueryFromCookie();
      } catch {
        clearSavedQueryCookie();
      }
    }

    if (!nextSavedQuery) return;

    setSavedQuery(nextSavedQuery);
    setName((current) => current || nextSavedQuery.name);
    setIdCard((current) => current || nextSavedQuery.idCard);

    try {
      window.localStorage.setItem(LAST_EMPLOYEE_QUERY_KEY, JSON.stringify(nextSavedQuery));
      writeSavedQueryToCookie(nextSavedQuery);
    } catch {
      try {
        writeSavedQueryToCookie(nextSavedQuery);
      } catch {
        // 忽略浏览器持久化限制。
      }
    }
  }, []);

  const rememberQuery = (queryName: string, queryIdCard: string) => {
    persistSavedQuery(queryName, queryIdCard);
  };

  const useSavedQuery = () => {
    if (!savedQuery) return;
    setName(savedQuery.name);
    setIdCard(savedQuery.idCard);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    persistSavedQuery(value, idCard);
  };

  const handleIdCardChange = (value: string) => {
    setIdCard(value);
    persistSavedQuery(name, value);
  };

  const clearSavedQuery = () => {
    setSavedQuery(null);
    setName('');
    setIdCard('');
    try {
      window.localStorage.removeItem(LAST_EMPLOYEE_QUERY_KEY);
    } catch {
      // 忽略本地存储清理失败。
    }
    try {
      clearSavedQueryCookie();
    } catch {
      // 忽略 Cookie 清理失败。
    }
  };

  const handleSearch = async () => {
    const queryName = name.trim();
    const queryIdCard = idCard.trim();

    if (!queryName || !queryIdCard) {
      alert('请输入姓名和身份证号');
      return;
    }
    
    setLoading(true);
    setNotFound(false);
    
    try {
      const response = await fetch(`/api/employees/query?name=${encodeURIComponent(queryName)}&idCard=${encodeURIComponent(queryIdCard)}`);
      const data = await response.json();
      
      if (data.success && data.employee) {
        setEmployee(data.employee);
        setSalaryRecords(data.salaryRecords || []);
        setSearched(true);
        rememberQuery(queryName, queryIdCard);
        
        // 记录查询日志
        logOperation({
          module: LogModules.EMPLOYEE_QUERY,
          action: LogActions.VIEW,
          details: {
            queryName,
            queryIdCard: maskIdCard(queryIdCard),
            employeeId: data.employee.id,
            employeeName: data.employee.name,
          },
          userId: data.employee.id,
          userName: data.employee.name,
        });
        
        // 自动选择最新有数据的月份
        const records = (data.salaryRecords || []) as SalaryRecord[];
        if (records.length > 0) {
          const latestRecord = records.reduce((a, b) => 
            (b.year * 12 + b.month_num) > (a.year * 12 + a.month_num) ? b : a
          );
          setSelectedYear(String(latestRecord.year));
          setSelectedMonth(String(latestRecord.month_num).padStart(2, '0'));
        }
        
        // API 已返回解析好的打卡记录
        console.log('API返回打卡记录:', data.attendanceRecords?.length || 0, '条');
        setAttendanceRecords(data.attendanceRecords || []);
        setLeaveRecords(data.leaveRecords || []);
        const missingRecords = (data.missingPunchRecords || []) as MissingPunchReminder[];
        const previousMonthKey = getPreviousMonthKey();
        const previousMonthMissingRecords = missingRecords.filter((record) => record.date.startsWith(`${previousMonthKey}-`));
        setMissingPunchRecords(missingRecords);
        setSelectedAttendanceMonth(previousMonthKey);
        setMissingPunchDialogOpen(previousMonthMissingRecords.length > 0);
      } else {
        setEmployee(null);
        setAttendanceRecords([]);
        setLeaveRecords([]);
        setMissingPunchRecords([]);
        setSelectedAttendanceMonth('');
        setMissingPunchDialogOpen(false);
        setSalaryRecords([]);
        setNotFound(true);
        setSearched(true);
      }
    } catch (error) {
      console.error('查询失败:', error);
      alert('查询失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 获取打卡数据按月份分组
  const attendanceByMonth = useMemo(() => {
    const grouped: Record<string, AttendanceRecord[]> = {};
    attendanceRecords.forEach(record => {
      const monthKey = record.date.substring(0, 7); // YYYY-MM
      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(record);
    });
    return grouped;
  }, [attendanceRecords]);

  const getLeaveMonthKeys = (leave: LeaveRequestRecord) => {
    const start = leave.leaveStartDate || leave.leaveDate;
    const end = leave.leaveEndDate || start;
    if (!start || !end) return [];

    const keys: string[] = [];
    const [startYear, startMonth] = start.split('-').map(Number);
    const [endYear, endMonth] = end.split('-').map(Number);
    if (!startYear || !startMonth || !endYear || !endMonth) return [];

    let cursor = startYear * 12 + startMonth;
    const endCursor = endYear * 12 + endMonth;
    while (cursor <= endCursor) {
      const year = Math.floor((cursor - 1) / 12);
      const month = ((cursor - 1) % 12) + 1;
      keys.push(`${year}-${String(month).padStart(2, '0')}`);
      cursor += 1;
    }
    return keys;
  };

  const attendanceMonthKeys = useMemo(() => {
    const keys = new Set(Object.keys(attendanceByMonth));
    leaveRecords.forEach((leave) => {
      getLeaveMonthKeys(leave).forEach((key) => keys.add(key));
    });
    missingPunchRecords.forEach((record) => keys.add(record.date.slice(0, 7)));
    return Array.from(keys).sort().reverse();
  }, [attendanceByMonth, leaveRecords, missingPunchRecords]);

  const visibleMissingPunchRecords = useMemo(() => (
    selectedAttendanceMonth
      ? missingPunchRecords.filter((record) => record.date.startsWith(`${selectedAttendanceMonth}-`))
      : []
  ), [missingPunchRecords, selectedAttendanceMonth]);

  const missingPunchCount = useMemo(() => (
    visibleMissingPunchRecords.reduce((total, record) => total + record.missingPeriods.length, 0)
  ), [visibleMissingPunchRecords]);

  const getDayLeaves = (date: string) => leaveRecords.filter((leave) =>
    leave.status === '已审核' && isDateInLeaveRange(leave, date)
  );

  const leaveDayCount = useMemo(() => {
    const dates = new Set<string>();
    leaveRecords.forEach((leave) => {
      const start = leave.leaveStartDate || leave.leaveDate;
      const end = leave.leaveEndDate || start;
      if (!start || !end) return;
      const cursorDate = new Date(`${start}T00:00:00`);
      const endDate = new Date(`${end}T00:00:00`);
      while (cursorDate <= endDate) {
        const year = cursorDate.getFullYear();
        const month = String(cursorDate.getMonth() + 1).padStart(2, '0');
        const day = String(cursorDate.getDate()).padStart(2, '0');
        dates.add(`${year}-${month}-${day}`);
        cursorDate.setDate(cursorDate.getDate() + 1);
      }
    });
    return dates.size;
  }, [leaveRecords]);

  // 获取某月某天的打卡记录
  const getDayAttendance = (monthKey: string, day: number): AttendanceRecord[] => {
    const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
    return attendanceRecords
      .filter(r => r.date === dateStr)
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  // 获取月份最大打卡次数
  const getMaxAttendanceCount = (monthKey: string): number => {
    const days = getDaysInMonth(parseInt(monthKey.split('-')[0]), parseInt(monthKey.split('-')[1]));
    let maxCount = 0;
    for (let d = 1; d <= days; d++) {
      const count = getDayAttendance(monthKey, d).length;
      if (count > maxCount) maxCount = count;
    }
    return Math.max(maxCount, 1);
  };

  // 计算工时数据
  const workHoursData = useMemo(() => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);
    const days = getDaysInMonth(year, month);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    
    const data = [];
    for (let d = 1; d <= days; d++) {
      const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
      const dayRecords = attendanceRecords
        .filter(r => r.date === dateStr)
        .sort((a, b) => a.time.localeCompare(b.time));
      
      // 获取所有打卡时间
      const allTimes = dayRecords.map(r => r.time);
      const weekend = isWeekend(year, month, d);
      
      const { normalHours, overtimeHours, totalHours, firstTime, lastTime } = calculateWorkHours(allTimes, weekend);
      
      if (allTimes.length > 0) {
        data.push({
          date: dateStr,
          weekday: getWeekday(year, month, d),
          allTimes, // 所有打卡时间
          checkInTime: firstTime,
          checkOutTime: lastTime,
          normalHours,
          overtimeHours,
          totalHours,
          isWeekend: weekend
        });
      }
    }
    return data;
  }, [selectedYear, selectedMonth, attendanceRecords]);

  // 筛选工资数据
  const filteredSalaryRecords = useMemo(() => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);
    return salaryRecords.filter(r => r.year === year && r.month_num === month);
  }, [selectedYear, selectedMonth, salaryRecords]);

  // 全屏切换函数
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 签字函数
  const openSignDialog = (recordId: number) => {
    setSignRecordId(recordId);
    setSignDialogOpen(true);
    setIsFullscreen(false);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      }
    }, 150);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const submitSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let hasSignature = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
        hasSignature = true;
        break;
      }
    }
    
    if (!hasSignature) {
      alert('请先签名');
      return;
    }
    
    const signature = canvas.toDataURL('image/png');
    
    try {
      const response = await fetch('/api/salary/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: signRecordId,
          signature,
        })
      });
      
      const result = await response.json();
      if (result.success) {
        logOperation({
          module: LogModules.EMPLOYEE_QUERY,
          action: LogActions.SIGN,
          details: {
            recordId: signRecordId,
            employeeName: employee?.name,
            month: `${selectedYear}-${selectedMonth}`,
            type: 'salary',
          },
          userId: employee?.id,
          userName: employee?.name,
        });
        
        alert('签字成功！');
        setSignDialogOpen(false);
        handleSearch();
      } else {
        alert(result.error || '签字失败');
      }
    } catch (error) {
      console.error('签字失败:', error);
      alert('签字失败，请稍后重试');
    }
  };

  // 年月选项
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, i) => String(currentYear - 10 + i));
  const monthOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const selectedMonthLabel = `${selectedYear}年${parseInt(selectedMonth)}月`;
  const totalNormalHours = workHoursData.reduce((s, r) => s + r.normalHours, 0);
  const totalOvertimeHours = workHoursData.reduce((s, r) => s + r.overtimeHours, 0);
  const totalWorkHours = workHoursData.reduce((s, r) => s + r.totalHours, 0);
  const signedSalaryCount = salaryRecords.filter(record => record.signature).length;
  const latestSalaryRecord = salaryRecords.length > 0
    ? salaryRecords.reduce((latest, record) =>
      (record.year * 12 + record.month_num) > (latest.year * 12 + latest.month_num) ? record : latest
    )
    : null;

  return (
    <div className="min-h-screen bg-[#f4f6f2] text-slate-950">
      <div className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#f8f9f6]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#12343b] text-white shadow-sm">
              <BadgeCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-normal text-slate-950 sm:text-lg">员工自助查询</h1>
              <p className="text-xs text-slate-500">工资 · 工时 · 打卡</p>
            </div>
          </div>
          <Badge variant="outline" className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:inline-flex">
            在职员工
          </Badge>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden border-0 bg-white py-0 shadow-sm ring-1 ring-stone-200/80">
            <CardContent className="p-0">
              <div className="border-b border-stone-100 bg-[#fbfcfa] px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                    <Search className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">身份校验</p>
                    <h2 className="text-lg font-semibold text-slate-950">查询入口</h2>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4 sm:p-5">
                {savedQuery && (
                  <div className="flex flex-col gap-2 rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={useSavedQuery}
                      className="flex min-w-0 items-center gap-2 text-left text-cyan-900"
                    >
                      <Clock className="h-4 w-4 shrink-0 text-cyan-700" />
                      <span className="truncate">本机上次查询：{formatSavedQueryLabel(savedQuery)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearSavedQuery}
                      className="self-start rounded-md p-1.5 text-cyan-700 transition-colors hover:bg-white/80 sm:self-auto"
                      title="清除上次查询记录"
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">清除上次查询记录</span>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">姓名</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="请输入姓名"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && canSearch && !loading) void handleSearch();
                        }}
                        autoComplete="name"
                        className="h-12 rounded-lg border-stone-200 bg-white pl-10 text-base shadow-none focus-visible:ring-cyan-600/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">身份证号</label>
                    <div className="relative">
                      <Fingerprint className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="请输入身份证号"
                        value={idCard}
                        onChange={(e) => handleIdCardChange(e.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && canSearch && !loading) void handleSearch();
                        }}
                        autoComplete="off"
                        className="h-12 rounded-lg border-stone-200 bg-white pl-10 text-base shadow-none focus-visible:ring-cyan-600/20"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    onClick={handleSearch}
                    className="h-12 w-full rounded-lg bg-[#12343b] px-6 text-base font-medium hover:bg-[#0f2b31] sm:w-auto"
                    disabled={loading || !canSearch}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    {loading ? '查询中...' : '查询'}
                  </Button>
                  {!idCard.trim() || idCard.trim().length < 15 ? (
                    <p className="flex items-center gap-1 text-xs text-amber-700">
                      <AlertCircle className="h-3.5 w-3.5" />
                      请输入完整的身份证号
                    </p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-[#12343b] py-0 text-white shadow-sm">
            <CardContent className="flex h-full flex-col justify-between gap-6 p-5">
              <div>
                <p className="text-xs font-medium text-white/55">当前月份</p>
                <p className="mt-2 text-2xl font-semibold">{selectedMonthLabel}</p>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-white/10 px-2 py-3">
                  <p className="text-lg font-semibold">{attendanceRecords.length}</p>
                  <p className="text-[11px] text-white/65">打卡</p>
                </div>
                <div className="rounded-lg bg-white/10 px-2 py-3">
                  <p className="text-lg font-semibold">{salaryRecords.length}</p>
                  <p className="text-[11px] text-white/65">工资</p>
                </div>
                <div className="rounded-lg bg-white/10 px-2 py-3">
                  <p className="text-lg font-semibold">{leaveDayCount}</p>
                  <p className="text-[11px] text-white/65">请假</p>
                </div>
                <div className="rounded-lg bg-white/10 px-2 py-3">
                  <p className="text-lg font-semibold">{signedSalaryCount}</p>
                  <p className="text-[11px] text-white/65">确认</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 未找到提示 */}
        {notFound && (
          <Card className="mt-4 border-0 bg-red-50 py-0 ring-1 ring-red-100">
            <CardContent className="flex items-center gap-3 p-4 text-red-700">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">未找到员工信息，请确认姓名和身份证号是否正确</p>
            </CardContent>
          </Card>
        )}

        {/* 查询结果 */}
        {searched && employee && (
          <>
            {/* 员工信息 */}
            <Card className="mt-4 overflow-hidden border-0 bg-white py-0 shadow-sm ring-1 ring-stone-200/80">
              <CardContent className="p-0">
                <div className="flex flex-col gap-4 border-b border-stone-100 bg-[#fbfcfa] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f0d58c] text-[#3a2c10]">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">当前员工</p>
                      <h2 className="text-xl font-semibold text-slate-950">{employee.name}</h2>
                    </div>
                  </div>
                  {latestSalaryRecord && (
                    <div className="rounded-xl bg-emerald-50 px-4 py-3 text-left sm:text-right">
                      <p className="text-xs text-emerald-700">最近实发</p>
                      <p className="text-lg font-semibold text-emerald-800">{formatMoney(latestSalaryRecord.actual_amount)}</p>
                    </div>
                  )}
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><Fingerprint className="h-3.5 w-3.5" />身份证号</p>
                    <p className="mt-1 break-all text-sm font-semibold text-slate-900">{employee.id_card || '-'}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><Building2 className="h-3.5 w-3.5" />部门</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{employee.department || '-'}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />位置</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{normalizeLocationLabel(employee.location)}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white p-3">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5" />状态</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{employee.status || '-'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {visibleMissingPunchRecords.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-red-800">
                      {selectedAttendanceMonth.replace('-', '年')}月发现 {missingPunchCount} 次缺卡，需要补卡
                    </p>
                    <p className="mt-1 text-sm text-red-700">
                      每位员工的打卡时间可能不同，请根据自己的上班打卡时间查看缺卡日期和时段。
                      当前时间：上班 {employee.attendance_check_in_time || '08:30'}、下班 {employee.attendance_check_out_time || '17:30'}。
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="shrink-0 bg-red-600 text-white hover:bg-red-700"
                  onClick={() => setMissingPunchDialogOpen(true)}
                >
                  查看补卡时段
                </Button>
              </div>
            )}

            {/* 三大手风琴模块 */}
            <Accordion type="single" collapsible defaultValue="salary" className="mt-4 space-y-3">
              {/* 打卡记录 */}
              <AccordionItem value="attendance" className="overflow-hidden rounded-2xl border-0 bg-white px-4 shadow-sm ring-1 ring-stone-200/80 sm:px-5">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="font-semibold text-slate-950">打卡记录</p>
                      <p className="text-xs text-slate-500">{attendanceRecords.length} 条打卡 · {leaveDayCount} 天请假 · {missingPunchCount} 次需补卡</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {attendanceMonthKeys.length === 0 ? (
                    <p className="rounded-xl bg-stone-50 py-8 text-center text-sm text-slate-500">暂无打卡或请假记录</p>
                  ) : (
                    <Accordion
                      type="single"
                      collapsible
                      value={selectedAttendanceMonth}
                      onValueChange={(monthKey) => {
                        setSelectedAttendanceMonth(monthKey);
                        setMissingPunchDialogOpen(Boolean(
                          monthKey && missingPunchRecords.some((record) => record.date.startsWith(`${monthKey}-`))
                        ));
                      }}
                      className="space-y-3"
                    >
                      {attendanceMonthKeys.map(monthKey => {
                        const [y, m] = monthKey.split('-').map(Number);
                        const days = getDaysInMonth(y, m);
                        const monthLeaveCount = Array.from({ length: days }, (_, index) => {
                          const date = `${monthKey}-${String(index + 1).padStart(2, '0')}`;
                          return getDayLeaves(date).length > 0 ? date : '';
                        }).filter(Boolean).length;
                        const monthMissingRecords = missingPunchRecords.filter((record) => record.date.startsWith(`${monthKey}-`));
                        const monthMissingCount = monthMissingRecords.reduce((total, record) => total + record.missingPeriods.length, 0);
                        const maxCount = Math.max(getMaxAttendanceCount(monthKey), monthLeaveCount > 0 || monthMissingCount > 0 ? 1 : 0);
                        
                        return (
                          <AccordionItem key={monthKey} value={monthKey} className="rounded-xl border border-stone-200 bg-[#fbfcfa] px-3">
                            <AccordionTrigger className="py-3 hover:no-underline">
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-slate-500" />
                                <span className="font-medium text-slate-900">{y}年{m}月</span>
                              </div>
                              <Badge variant="outline" className="mr-2 border-stone-200 bg-white text-slate-600">
                                {(attendanceByMonth[monthKey] || []).length} 条 · 请假 {monthLeaveCount} 天 · 补卡 {monthMissingCount} 次
                              </Badge>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                                <span>月度明细</span>
                                <span className="flex items-center gap-1">
                                  <ChevronLeft className="h-3 w-3" />
                                  <ChevronRight className="h-3 w-3" />
                                </span>
                              </div>
                              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                                <table className="min-w-max text-xs">
                                  <thead>
                                    <tr className="bg-stone-50">
                                      <th className="sticky left-0 z-10 min-w-[52px] border-r border-stone-200 bg-stone-50 p-2 text-slate-500">次数</th>
                                      {Array.from({ length: days }, (_, i) => i + 1).map(day => (
                                        <th key={day} className={`min-w-[62px] border-r border-stone-200 p-2 ${isWeekend(y, m, day) ? 'bg-amber-50' : ''}`}>
                                          <div>{day}</div>
                                          <div className="text-slate-400">{getWeekday(y, m, day)}</div>
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {Array.from({ length: maxCount }, (_, i) => i + 1).map(row => (
                                      <tr key={row}>
                                        <td className="sticky left-0 z-10 border-r border-t border-stone-200 bg-white p-2 text-center font-medium text-slate-700">
                                          第{row}次
                                        </td>
                                        {Array.from({ length: days }, (_, i) => i + 1).map(day => {
                                          const records = getDayAttendance(monthKey, day);
                                          const record = records[row - 1];
                                          const time = record?.time;
                                          const dateText = `${monthKey}-${String(day).padStart(2, '0')}`;
                                          const dayLeaves = row === 1 ? getDayLeaves(dateText) : [];
                                          const leaveLabel = [...new Set(dayLeaves.map((leave) => formatAttendanceLeaveLabel(leave.duration)))].join('、');
                                          // 检查是否有备注（括号内容）
                                          const hasNote = time && time.includes('（');
                                          const displayTime = time ? time.substring(0, 5) : '';
                                          const hasLeave = dayLeaves.length > 0;
                                          const missingReminder = row === 1
                                            ? monthMissingRecords.find((reminder) => reminder.date === dateText)
                                            : undefined;
                                          const hasMissingPunch = Boolean(missingReminder?.missingPeriods.length);

                                          return (
                                            <td 
                                              key={day} 
                                              className={`border-r border-t border-stone-200 p-1.5 text-center ${isWeekend(y, m, day) ? 'bg-amber-50' : ''} ${hasLeave ? 'bg-rose-50 text-rose-600' : ''} ${hasMissingPunch ? 'bg-red-50 ring-1 ring-inset ring-red-200' : ''}`}
                                            >
                                              {time || hasLeave || hasMissingPunch ? (
                                                <div className="flex flex-col items-center">
                                                  {time && <span className={hasNote ? 'font-medium text-cyan-700' : hasLeave ? 'text-rose-700' : 'text-slate-800'}>{displayTime}</span>}
                                                  {hasNote && (
                                                    <span className="max-w-[50px] truncate text-[10px] text-cyan-600">
                                                      {time.match(/（(.+?)）/)?.[1]?.substring(0, 4)}
                                                    </span>
                                                  )}
                                                  {hasLeave && (
                                                    <span className="max-w-[56px] truncate text-[10px] font-semibold text-rose-600">
                                                      {leaveLabel}
                                                    </span>
                                                  )}
                                                  {missingReminder?.missingPeriods.map((period) => (
                                                    <span key={period} className="whitespace-nowrap text-[10px] font-semibold text-red-600">
                                                      缺 {missingPunchLabel(period, missingReminder)}
                                                    </span>
                                                  ))}
                                                </div>
                                              ) : (
                                                <span className="text-slate-300">-</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* 工时 */}
              <AccordionItem value="workhours" className="overflow-hidden rounded-2xl border-0 bg-white px-4 shadow-sm ring-1 ring-stone-200/80 sm:px-5">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                      <Timer className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="font-semibold text-slate-950">工时</p>
                      <p className="text-xs text-slate-500">{selectedMonthLabel}</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="h-10 w-24 rounded-lg border-stone-200 text-sm">
                        <SelectValue placeholder="年" />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map(y => (
                          <SelectItem key={y} value={y} className="text-sm">{y}年</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="h-10 w-24 rounded-lg border-stone-200 text-sm">
                        <SelectValue placeholder="月" />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions.map(m => (
                          <SelectItem key={m} value={m} className="text-sm">{parseInt(m)}月</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-10 rounded-lg border-stone-200 px-4 text-sm">
                      查询
                    </Button>
                  </div>
                  
                  {workHoursData.length === 0 ? (
                    <p className="rounded-xl bg-stone-50 py-8 text-center text-sm text-slate-500">暂无工时记录</p>
                  ) : (
                    <>
                      <div className="mb-4 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-cyan-50 p-3 text-center">
                          <p className="text-sm font-semibold text-cyan-800 sm:text-lg">{formatWorkHours(totalNormalHours)}</p>
                          <p className="mt-1 text-[11px] text-slate-500">正班</p>
                        </div>
                        <div className="rounded-xl bg-amber-50 p-3 text-center">
                          <p className="text-sm font-semibold text-amber-800 sm:text-lg">{formatWorkHours(totalOvertimeHours)}</p>
                          <p className="mt-1 text-[11px] text-slate-500">加班</p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 p-3 text-center">
                          <p className="text-sm font-semibold text-emerald-800 sm:text-lg">{formatWorkHours(totalWorkHours)}</p>
                          <p className="mt-1 text-[11px] text-slate-500">合计</p>
                        </div>
                      </div>

                      <div className="space-y-3 md:hidden">
                        {workHoursData.map((row, i) => (
                          <div key={i} className={`rounded-xl border p-3 ${row.isWeekend ? 'border-amber-200 bg-amber-50/70' : 'border-stone-200 bg-white'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-slate-950">{row.date}</p>
                                <p className="text-xs text-slate-500">星期{row.weekday}</p>
                              </div>
                              <Badge variant="outline" className={row.isWeekend ? 'border-amber-200 bg-white text-amber-700' : 'border-stone-200 bg-stone-50 text-slate-600'}>
                                {row.isWeekend ? '周末' : '工作日'}
                              </Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {row.allTimes.map((t: string, idx: number) => (
                                <span key={idx} className={`rounded-md px-2 py-1 text-xs ${idx === 0 || idx === row.allTimes.length - 1 ? 'bg-cyan-50 text-cyan-700' : 'bg-stone-100 text-slate-600'}`}>
                                  {t}
                                </span>
                              ))}
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-lg bg-white/80 p-2">
                                <p className="text-xs text-slate-500">上班</p>
                                <p className="font-medium text-slate-900">{row.checkInTime || '-'}</p>
                              </div>
                              <div className="rounded-lg bg-white/80 p-2">
                                <p className="text-xs text-slate-500">下班</p>
                                <p className="font-medium text-slate-900">{row.checkOutTime || '-'}</p>
                              </div>
                              <div className="rounded-lg bg-white/80 p-2">
                                <p className="text-xs text-slate-500">合计</p>
                                <p className="font-medium text-slate-900">{formatWorkHours(row.totalHours)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="hidden overflow-x-auto rounded-xl border border-stone-200 md:block">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-stone-50 text-slate-600">
                              <th className="border-r border-stone-200 p-2 text-left whitespace-nowrap">日期</th>
                              <th className="border-r border-stone-200 p-2 text-left">星期</th>
                              <th className="border-r border-stone-200 p-2 text-left whitespace-nowrap">打卡记录</th>
                              <th className="border-r border-stone-200 p-2 text-left">上班</th>
                              <th className="border-r border-stone-200 p-2 text-left">下班</th>
                              <th className="border-r border-stone-200 p-2 text-left">正班</th>
                              <th className="border-r border-stone-200 p-2 text-left">加班</th>
                              <th className="p-2 text-left">合计</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workHoursData.map((row, i) => (
                              <tr key={i} className={row.isWeekend ? 'bg-amber-50/70' : 'bg-white'}>
                                <td className="border-r border-t border-stone-200 p-2 whitespace-nowrap">{row.date}</td>
                                <td className="border-r border-t border-stone-200 p-2">{row.weekday}</td>
                                <td className="border-r border-t border-stone-200 p-2 text-xs text-slate-600">
                                  <div className="flex flex-wrap gap-1">
                                    {row.allTimes.map((t: string, idx: number) => (
                                      <span key={idx} className={`rounded px-1.5 py-0.5 ${idx === 0 || idx === row.allTimes.length - 1 ? 'bg-cyan-50 text-cyan-700' : 'bg-stone-100'}`}>
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="border-r border-t border-stone-200 p-2">{row.checkInTime || '-'}</td>
                                <td className="border-r border-t border-stone-200 p-2">{row.checkOutTime || '-'}</td>
                                <td className="border-r border-t border-stone-200 p-2 text-cyan-700">{formatWorkHours(row.normalHours)}</td>
                                <td className="border-r border-t border-stone-200 p-2 text-amber-700">{formatWorkHours(row.overtimeHours)}</td>
                                <td className="border-t border-stone-200 p-2 font-medium">{formatWorkHours(row.totalHours)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* 工资 */}
              <AccordionItem value="salary" className="overflow-hidden rounded-2xl border-0 bg-white px-4 shadow-sm ring-1 ring-stone-200/80 sm:px-5">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="font-semibold text-slate-950">工资</p>
                      <p className="text-xs text-slate-500">{selectedMonthLabel}</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="h-10 w-24 rounded-lg border-stone-200 text-sm">
                        <SelectValue placeholder="年" />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map(y => (
                          <SelectItem key={y} value={y} className="text-sm">{y}年</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="h-10 w-24 rounded-lg border-stone-200 text-sm">
                        <SelectValue placeholder="月" />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions.map(m => (
                          <SelectItem key={m} value={m} className="text-sm">{parseInt(m)}月</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-10 rounded-lg border-stone-200 px-4 text-sm">查询</Button>
                  </div>
                  
                  {filteredSalaryRecords.length === 0 ? (
                    <p className="rounded-xl bg-stone-50 py-8 text-center text-sm text-slate-500">暂无工资记录</p>
                  ) : (
                    <div className="space-y-4">
                      {filteredSalaryRecords.map((record) => {
                        const isOffice = record.location !== '车间';
                        return (
                          <div key={record.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                            <div className="bg-[#12343b] px-4 py-4 text-white sm:px-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs text-white/60">{record.year}年{record.month_num}月</p>
                                  <h3 className="mt-1 text-lg font-semibold">{record.employee_name}</h3>
                                </div>
                                <Badge className={record.signature ? 'border-0 bg-emerald-100 text-emerald-800' : 'border-0 bg-white/15 text-white'}>
                                  {record.signature ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                                  {record.signature ? '已确认' : '待确认'}
                                </Badge>
                              </div>
                              <div className="mt-5 flex items-end justify-between gap-3">
                                <div>
                                  <p className="text-xs text-white/60">实发工资</p>
                                  <p className="mt-1 text-3xl font-semibold tracking-normal">{formatMoney(record.actual_amount)}</p>
                                </div>
                                <div className="text-right text-xs text-white/65">
                                  <p>{isOffice ? '办公室' : '车间'}</p>
                                  <p>{record.department || '-'}</p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 bg-[#fbfcfa] px-4 py-3 text-xs text-slate-500 sm:px-5">
                              <Badge variant="outline" className="border-stone-200 bg-white text-slate-600">
                                <ReceiptText className="h-3 w-3" />
                                工资条
                              </Badge>
                              {record.bank_account && (
                                <Badge variant="outline" className="border-stone-200 bg-white text-slate-600">
                                  <CreditCard className="h-3 w-3" />
                                  银行卡
                                </Badge>
                              )}
                              {hasAmount(record.total_payable) && (
                                <Badge variant="outline" className="border-stone-200 bg-white text-slate-600">
                                  <CircleDollarSign className="h-3 w-3" />
                                  应领 {formatMoney(record.total_payable)}
                                </Badge>
                              )}
                            </div>
                            
                            {/* 基础信息 */}
                            <div className="space-y-2 border-b border-stone-100 p-4 sm:px-5">
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-500">序号</span>
                                <span className="text-slate-800">{record.id}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-500">部门</span>
                                <span className="text-slate-800">{record.department || '-'}</span>
                              </div>
                              {record.base_salary > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-500">基本工资</span>
                                  <span className="text-slate-800">¥{record.base_salary?.toLocaleString() ?? "0"}</span>
                                </div>
                              )}
                            </div>
                            
                            {/* 考勤记录 */}
                            <div className="border-b border-stone-100 p-4 sm:px-5">
                              <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">考勤记录</p>
                              <div className="space-y-2">
                                {(record.should_attend_days ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">正班应出勤天数</span>
                                    <span className="text-slate-800">{record.should_attend_days}天</span>
                                  </div>
                                )}
                                {(record.saturday_days ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">当月周六天数</span>
                                    <span className="text-slate-800">{record.saturday_days}天</span>
                                  </div>
                                )}
                                {(record.actual_attend_days ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">正班实际出勤天数</span>
                                    <span className="text-slate-800">{record.actual_attend_days}天</span>
                                  </div>
                                )}
                                {(record.paid_leave_days ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">本月已休带薪假</span>
                                    <span className="text-slate-800">{record.paid_leave_days}天</span>
                                  </div>
                                )}
                                {(record.weekday_overtime ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">平时加班时间</span>
                                    <span className="text-slate-800">{record.weekday_overtime}小时</span>
                                  </div>
                                )}
                                {(record.weekend_overtime ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">周末加班时间</span>
                                    <span className="text-slate-800">{record.weekend_overtime}小时</span>
                                  </div>
                                )}
                                {(record.holiday_overtime ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">法定日加班</span>
                                    <span className="text-slate-800">{record.holiday_overtime}天</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* 基本工资+补贴项目 */}
                            <div className="border-b border-stone-100 p-4 sm:px-5">
                              <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">基本工资+补贴项目</p>
                              <div className="space-y-2">
                                {(record.normal_pay ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">实际出勤工资</span>
                                    <span className="text-blue-600 font-medium">¥{(record.normal_pay ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.holiday_pay ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">本月法定日休假工资</span>
                                    <span className="text-blue-600 font-medium">¥{(record.holiday_pay ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.weekday_overtime_pay ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">平时加班工资</span>
                                    <span className="text-blue-600 font-medium">¥{record.weekday_overtime_pay?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                                {(record.weekend_overtime_pay ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">周未加班工资</span>
                                    <span className="text-blue-600 font-medium">¥{record.weekend_overtime_pay?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                                {(record.holiday_overtime_pay ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">法定日加班工资</span>
                                    <span className="text-blue-600 font-medium">¥{record.holiday_overtime_pay?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                                {(record.performance_bonus ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">绩效奖金</span>
                                    <span className="text-blue-600 font-medium">¥{record.performance_bonus?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                                {(record.meal_subsidy ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">用餐补贴</span>
                                    <span className="text-blue-600 font-medium">¥{(record.meal_subsidy ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.housing_subsidy ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">住房补贴</span>
                                    <span className="text-blue-600 font-medium">¥{record.housing_subsidy?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                                {(record.transport_subsidy ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">交通补贴</span>
                                    <span className="text-blue-600 font-medium">¥{(record.transport_subsidy ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.position_subsidy ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">岗位补贴</span>
                                    <span className="text-blue-600 font-medium">¥{(record.position_subsidy ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.living_subsidy ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">生活补贴</span>
                                    <span className="text-blue-600 font-medium">¥{(record.living_subsidy ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.other_subsidy ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">补贴</span>
                                    <span className="text-blue-600 font-medium">¥{record.other_subsidy?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                                {/* 应领工资 */}
                                {(record.total_payable ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm font-semibold border-t border-slate-100 pt-2 mt-2">
                                    <span className="text-slate-700">应领工资</span>
                                    <span className="text-blue-600">¥{record.total_payable?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* 应扣项目 */}
                            <div className="border-b border-stone-100 p-4 sm:px-5">
                              <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">应扣项目</p>
                              <div className="space-y-2">
                                {(record.housing_fund ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">公积金</span>
                                    <span className="text-red-500">¥{(record.housing_fund ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.social_insurance ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">社会保险</span>
                                    <span className="text-red-500">¥{record.social_insurance?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                                {(record.social_pension_adj ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">社保养老调</span>
                                    <span className="text-red-500">¥{record.social_pension_adj?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                                {(record.fine ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">扣款</span>
                                    <span className="text-red-500">¥{(record.fine ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.other_deduction ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">其他扣款</span>
                                    <span className="text-red-500">¥{(record.other_deduction ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* 底部汇总 */}
                            <div className="bg-[#fbfcfa] p-4 sm:px-5">
                              <div className="space-y-2">
                                {(record.social_security_subsidy ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">社保补贴</span>
                                    <span className="text-blue-600 font-medium">¥{(record.social_security_subsidy ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.pre_tax_salary ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">税前工资</span>
                                    <span className="text-slate-800">¥{record.pre_tax_salary?.toLocaleString() ?? "0"}</span>
                                  </div>
                                )}
                                {(record.income_tax ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">个人所得税</span>
                                    <span className="text-red-500">¥{(record.income_tax ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.seniority_award ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">工龄奖</span>
                                    <span className="text-slate-800">¥{(record.seniority_award ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.full_attendance_award ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">全勤奖</span>
                                    <span className="text-slate-800">¥{(record.full_attendance_award ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.living_subsidy ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">生活补贴</span>
                                    <span className="text-slate-800">¥{(record.living_subsidy ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.deduct_utilities ?? 0) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">本月水电费</span>
                                    <span className="text-red-500">¥{(record.deduct_utilities ?? 0).toLocaleString()}</span>
                                  </div>
                                )}

                                {(record.deduct_social_security ?? 0) !== 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">社保扣款</span>
                                    <span className="text-red-500">¥{Math.abs(record.deduct_social_security ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.deduct_loan ?? 0) !== 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">贷款扣款</span>
                                    <span className="text-red-500">¥{Math.abs(record.deduct_loan ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.deduct_urgent ?? 0) !== 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">急扣</span>
                                    <span className="text-red-500">¥{Math.abs(record.deduct_urgent ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.deduct_other ?? 0) !== 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">其他扣除</span>
                                    <span className="text-red-500">¥{Math.abs(record.deduct_other ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.fine ?? 0) !== 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">扣款</span>
                                    <span className="text-red-500">¥{Math.abs(record.fine ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {(record.other_deduction ?? 0) !== 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">其他扣款</span>
                                    <span className="text-red-500">¥{Math.abs(record.other_deduction ?? 0).toLocaleString()}</span>
                                  </div>
                                )}
                                {/* 实发工资 */}
                                {(record.actual_amount ?? 0) > 0 && (
                                  <div className="mt-2 flex justify-between border-t border-stone-200 pt-3 text-base font-bold">
                                    <span className="text-slate-800">实发工资</span>
                                    <span className="text-emerald-700">{formatMoney(record.actual_amount)}</span>
                                  </div>
                                )}
                                {/* 银行卡号 */}
                                {record.bank_account && (
                                  <div className="mt-3 flex justify-between text-sm">
                                    <span className="text-slate-500">银行卡号</span>
                                    <span className="max-w-[60%] break-all text-right text-slate-700">{record.bank_account}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* 签字区域 */}
                            <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-3 sm:px-5">
                              {record.signature ? (
                                <div className="flex items-center gap-3">
                                  <img src={record.signature} alt="签字" className="h-12 rounded-lg border border-stone-200 bg-white" />
                                  <div className="text-xs text-slate-500">
                                    <p className="font-medium text-emerald-700">已签字确认</p>
                                    {record.signature_time && <p>{formatChinaDate(record.signature_time)}</p>}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="text-xs text-slate-500">签字状态：待确认</p>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => openSignDialog(record.id)}
                                    className="h-9 rounded-lg border-stone-200 px-3 text-xs hover:bg-stone-50"
                                  >
                                    签字确认
                                  </Button>
                                </>
                              )}
                            </div>
                            
                            {/* 备注 */}
                            {record.remark && (
                              <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 sm:px-5">
                                <p className="text-xs text-amber-700">备注：{record.remark}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}

        <Dialog open={missingPunchDialogOpen} onOpenChange={setMissingPunchDialogOpen}>
          <DialogContent className="max-h-[82vh] max-w-lg overflow-hidden rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                需要补卡提醒
              </DialogTitle>
              <DialogDescription>
                当前只显示 {selectedAttendanceMonth.replace('-', '年')}月的缺卡记录。点击打卡记录中的其他月份，可切换查看对应月份。
                每位员工的打卡时间可能不同，请根据自己的上班、下班时间查看缺卡日期和时段。
                当前时间：上班 {employee?.attendance_check_in_time || '08:30'}、下班 {employee?.attendance_check_out_time || '17:30'}。
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
              {visibleMissingPunchRecords.map((record) => (
                <div key={record.date} className="rounded-xl border border-red-100 bg-red-50 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{record.date}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {record.missingPeriods.map((period) => (
                        <span key={period} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200">
                          缺 {missingPunchLabel(period, record)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* 签字对话框 */}
        {signDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6">
            <div className="absolute inset-0 bg-slate-950/55" onClick={() => setSignDialogOpen(false)} />
            <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl sm:h-[78vh] sm:rounded-2xl">
              <div className="flex items-center justify-between border-b border-stone-200 bg-[#fbfcfa] px-4 py-3 sm:rounded-t-2xl">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">确认签字</h3>
                  <p className="text-xs text-slate-500">工资明细确认</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleFullscreen}
                    className="rounded-lg border border-stone-300 p-2 transition-colors hover:bg-stone-100"
                    title={isFullscreen ? '退出全屏' : '全屏'}
                  >
                    {isFullscreen ? <Minimize2 className="h-5 w-5 text-slate-600" /> : <Maximize2 className="h-5 w-5 text-slate-600" />}
                  </button>
                  <button
                    onClick={() => setSignDialogOpen(false)}
                    className="rounded-lg border border-stone-300 p-2 transition-colors hover:bg-stone-100"
                  >
                    <X className="h-5 w-5 text-slate-600" />
                  </button>
                </div>
              </div>
              <div className="flex flex-1 flex-col bg-[#f4f6f2] p-4">
                <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-dashed border-stone-300 bg-white">
                  <canvas
                    ref={canvasRef}
                    className="h-full w-full touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={(e) => { e.preventDefault(); startDrawing(e); }}
                    onTouchMove={(e) => { e.preventDefault(); draw(e); }}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={clearSignature}
                    className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-stone-100"
                  >
                    <RotateCcw className="h-4 w-4" />
                    清除
                  </button>
                  <button
                    onClick={submitSignature}
                    className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#12343b] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0f2b31]"
                  >
                    确认签字
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 底部说明 */}
        <div className="mt-6 text-center text-sm text-slate-400">
          <p>如有问题请联系人事部门</p>
        </div>
      </main>
    </div>
  );
}
