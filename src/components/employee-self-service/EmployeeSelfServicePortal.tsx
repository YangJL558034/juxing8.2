'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Bell, BriefcaseBusiness, Building2, CalendarDays,
  CheckCircle2, ChevronRight, CircleUserRound, Clock3, FileCheck2, FileText,
  Fingerprint, HandCoins, Home, IdCard, LoaderCircle, LogOut, MapPin,
  Megaphone, MessageCircleMore, ReceiptText, RotateCcw, Search, ShieldCheck,
  TimerReset, UserRound, WalletCards, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { missingPunchLabel, type MissingPunchReminder } from '@/lib/attendance-missing-punch';
import type { LeaveRequestRecord } from '@/types/leave-request';
import LeaveRequestPage from '@/app/leave-request/page';
import SocialSecurityPage from '@/app/social-security/page';
import ResignationPage from '@/app/resignation/page';
import WorkCertificatePage from '@/app/work-certificate/page';
import RegularizationPage from '@/app/regularization/page';
import MobileItemClaims from '@/components/mobile/MobileItemClaims';

type PortalTab = 'home' | 'salary' | 'attendance' | 'work-hours' | 'services' | 'profile' | 'reviews';
type ServiceTab = 'leave' | 'social-security' | 'agreement';
type EmbeddedFlow = 'leave' | 'social' | 'resignation' | 'work-certificate' | 'regularization' | 'item-claim' | null;

interface Employee {
  id: number;
  employee_id?: string | null;
  avatar_url?: string | null;
  isSelfServiceManager?: boolean;
  selfServiceManagerLocation?: string;
  name: string;
  gender?: string | null;
  id_card: string;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  status?: string | null;
  location?: string | null;
  hire_date?: string | null;
  attendance_check_in_time?: string | null;
  attendance_check_out_time?: string | null;
}

interface SalaryRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  year: number;
  month_num: number;
  base_salary?: number;
  normal_hours?: number;
  weekday_overtime?: number;
  weekend_overtime?: number;
  normal_pay?: number;
  weekday_overtime_pay?: number;
  weekend_overtime_pay?: number;
  performance_allowance?: number;
  performance_pay?: number;
  living_subsidy?: number;
  meal_subsidy?: number;
  housing_subsidy?: number;
  transport_subsidy?: number;
  other_subsidy?: number;
  other_pay?: number;
  seniority_award?: number;
  full_attendance_award?: number;
  position_subsidy?: number;
  work_reward?: number;
  spring_festival_subsidy?: number;
  social_security_subsidy?: number;
  total_payable?: number;
  deduct_social_security?: number;
  deduct_utilities?: number;
  deduct_loan?: number;
  deduct_urgent?: number;
  deduct_other?: number;
  other_deduction?: number;
  fine?: number;
  housing_fund?: number;
  social_insurance?: number;
  income_tax?: number;
  total_deduction?: number;
  actual_amount?: number;
  actual_attend_days?: number;
  should_attend_days?: number;
  signature?: string | null;
  signature_time?: string | null;
  remark?: string | null;
}

interface AttendanceRecord {
  employee_id: number;
  employee_name: string;
  date: string;
  time: string;
}

interface ServiceSummary {
  onboarding: {
    id: number;
    status: string;
    createdAt: string;
    confidentialityConfirmed: boolean;
  } | null;
  socialSecurity: Array<{
    id: number;
    documentType: string;
    status: string;
    applicationDate: string | null;
    createdAt: string;
  }>;
  socialSecurityPurchase: Array<{
    id: number;
    status: string;
    insuranceStatus: string | null;
    createdAt: string;
  }>;
  notifications: Array<{
    id: number;
    title: string;
    content: string | null;
    senderName: string | null;
    attachmentFile?: string | null;
    attachmentFileName?: string | null;
    isRead?: boolean;
    createdAt: string;
  }>;
  resignationRecords?: Array<{ id: number; status: string; createdAt: string }>;
  regularizationRecords?: Array<{ id: number; status: string; createdAt: string }>;
  workCertificateRecords?: Array<{ id: number; status: string; createdAt: string }>;
}

interface QueryResponse {
  success?: boolean;
  error?: string;
  employee?: Employee;
  salaryRecords?: SalaryRecord[];
  attendanceRecords?: AttendanceRecord[];
  leaveRecords?: LeaveRequestRecord[];
  missingPunchRecords?: MissingPunchReminder[];
  serviceSummary?: ServiceSummary;
}

interface PortalData {
  employee: Employee;
  salaryRecords: SalaryRecord[];
  attendanceRecords: AttendanceRecord[];
  leaveRecords: LeaveRequestRecord[];
  missingPunchRecords: MissingPunchReminder[];
  serviceSummary: ServiceSummary;
}

interface DailyAttendance {
  date: string;
  times: string[];
  firstTime: string;
  lastTime: string;
  totalHours: number;
  missing?: MissingPunchReminder;
}

const SESSION_KEY = 'employee-self-service-identity';
const emptyServiceSummary: ServiceSummary = { onboarding: null, socialSecurity: [], socialSecurityPurchase: [], notifications: [], resignationRecords: [], regularizationRecords: [], workCertificateRecords: [] };

function previousMonthKey(): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(value?: number | null): string {
  const amount = Number(value || 0);
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(monthKey: string): string {
  if (!monthKey) return '暂无月份';
  const [year, month] = monthKey.split('-');
  return `${year}年${Number(month)}月`;
}

function displayDate(value?: string | null): string {
  return value ? value.slice(0, 10) : '-';
}

function statusTone(status?: string | null): string {
  if (!status) return 'bg-slate-100 text-slate-600';
  if (status.includes('已') || status.includes('通过') || status.includes('生效')) return 'bg-emerald-50 text-emerald-700';
  if (status.includes('拒绝') || status.includes('驳回')) return 'bg-rose-50 text-rose-700';
  return 'bg-amber-50 text-amber-700';
}

function socialSecurityTitle(documentType: string): string {
  if (documentType === 'combined') return '不购买社保 / 自愿放弃声明';
  if (documentType === 'no_purchase') return '要求不购买社保申请书';
  if (documentType === 'waiver') return '自愿放弃社保声明';
  return documentType || '社保申请';
}

function sumSalary(record: SalaryRecord, keys: Array<keyof SalaryRecord>): number {
  return keys.reduce((total, key) => total + Number(record[key] || 0), 0);
}

function calculateDuration(first: string, last: string): number {
  const parse = (time: string) => {
    const match = time.match(/^(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = parse(first);
  const end = parse(last);
  if (start === null || end === null || end <= start) return 0;
  const minutes = end - start;
  return Math.max(0, (minutes > 5 * 60 ? minutes - 90 : minutes) / 60);
}

function maskIdCard(value: string): string {
  if (value.length < 10) return value;
  return `${value.slice(0, 6)}********${value.slice(-4)}`;
}

function notificationAttachmentUrl(value: string): string {
  return value.startsWith('/uploads/') ? `/api/upload/${value.split('/').pop()}` : value;
}

function isImageAttachment(name?: string | null): boolean {
  return Boolean(name && /\.(jpe?g|png|gif|webp)$/i.test(name));
}

function AvatarMark({ name, gender, large = false, src }: { name: string; gender?: string | null; large?: boolean; src?: string }) {
  const female = gender === '女';
  return <div aria-label={`${name}头像`} className={`${large ? 'h-16 w-16' : 'h-11 w-11'} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${female ? 'from-pink-300 to-rose-500 shadow-pink-200' : 'from-blue-300 to-blue-600 shadow-blue-200'} text-white shadow-lg`}>{src ? <img src={src} alt={`${name}头像`} className="h-full w-full object-cover" /> : <UserRound className={large ? 'h-9 w-9' : 'h-6 w-6'} strokeWidth={1.8} />}</div>;
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">{icon}</div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tracking-tight text-slate-950">{value}</p></div>;
}

export default function EmployeeSelfServicePortal() {
  const [name, setName] = useState('');
  const [idCard, setIdCard] = useState('');
  const [data, setData] = useState<PortalData | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [activeTab, setActiveTab] = useState<PortalTab>('home');
  const [, setTabHistory] = useState<PortalTab[]>(['home']);
  const [serviceTab, setServiceTab] = useState<ServiceTab>('leave');
  const [embeddedFlow, setEmbeddedFlow] = useState<EmbeddedFlow>(null);
  const [selectedSalaryMonth, setSelectedSalaryMonth] = useState('');
  const [selectedAttendanceMonth, setSelectedAttendanceMonth] = useState('');
  const [expandedAttendanceDate, setExpandedAttendanceDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [missingDialogOpen, setMissingDialogOpen] = useState(false);
  const [hrDialogOpen, setHrDialogOpen] = useState(false);
  const [hrMessage, setHrMessage] = useState('');
  const [hrSending, setHrSending] = useState(false);
  const [hrSent, setHrSent] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [notificationAutoOnlyLatest, setNotificationAutoOnlyLatest] = useState(false);
  const [applicationDrawerOpen, setApplicationDrawerOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<number[]>([]);
  const [managerApplications, setManagerApplications] = useState<Array<{ id: number; type: string; employeeName: string; department?: string; status: string; createdAt: string }>>([]);
  const [signRecord, setSignRecord] = useState<SalaryRecord | null>(null);
  const [signing, setSigning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const sessionRestoreAttempted = useRef(false);

  const loadManagerApplications = async () => {
    try {
    const response = await fetch('/api/employee-self-service/manager/applications', { cache: 'no-store' });
    const payload = await response.json() as { success?: boolean; error?: string; records?: Array<{ id: number; type: string; employeeName: string; department?: string; status: string; createdAt: string }> };
    if (!response.ok || !payload.success) throw new Error(payload.error || '审核列表加载失败');
    setManagerApplications(payload.records || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '审核列表加载失败，请重试');
    }
  };

  const reviewApplication = async (type: string, id: number, status: '已审核' | '已驳回') => {
    setError('');
    try {
      const response = await fetch('/api/employee-self-service/manager/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, status }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || '审核失败');
      await loadManagerApplications();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : '审核失败，请重试');
    }
  };

  useEffect(() => {
    if (!data?.employee) return;
    const currentEmployee = data.employee;
    setAvatarUrl(currentEmployee.avatar_url || '');
    if (currentEmployee.avatar_url) return;
    let cancelled = false;
    const migrateAvatar = async () => {
      try {
        const key = `employee-self-service-avatar:${currentEmployee.id_card}`;
        const legacy = window.localStorage.getItem(key);
        if (!legacy || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(legacy)) return;
        const blob = await (await fetch(legacy)).blob();
        const form = new FormData();
        form.append('file', blob, 'avatar');
        form.append('migration', 'true');
        const response = await fetch('/api/employee-self-service/avatar', { method: 'POST', body: form });
        const result = await response.json() as { success?: boolean; avatarUrl?: string };
        if (!cancelled && response.ok && result.success && result.avatarUrl) {
          setAvatarUrl(result.avatarUrl);
          window.localStorage.removeItem(key);
        }
      } catch { /* 保留旧头像，稍后可再次迁移。 */ }
    };
    void migrateAvatar();
    return () => { cancelled = true; };
  }, [data?.employee]);

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { setError('头像图片不能超过 5MB'); return; }
    const form = new FormData(); form.append('file', file); form.append('idCard', employee.id_card);
    void fetch('/api/employee-self-service/avatar', { method: 'POST', body: form }).then(async (response) => { const result = await response.json() as { success?: boolean; avatarUrl?: string; error?: string }; if (!response.ok || !result.success || !result.avatarUrl) throw new Error(result.error || '头像上传失败'); setAvatarUrl(result.avatarUrl); }).catch((uploadError) => setError(uploadError instanceof Error ? uploadError.message : '头像上传失败'));
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadPortal = async (queryName = name, queryIdCard = idCard, preserveNavigation = false) => {
    const normalizedName = queryName.trim();
    const normalizedIdCard = queryIdCard.trim();
    if (!normalizedName || !normalizedIdCard) {
      setError('请输入员工姓名和身份证号');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/employees/query?name=${encodeURIComponent(normalizedName)}&idCard=${encodeURIComponent(normalizedIdCard)}`, { cache: 'no-store' });
      const result = await response.json() as QueryResponse;
      if (!response.ok || !result.success || !result.employee) {
        setError(result.error || '员工信息验证失败');
        return;
      }
      const portalData: PortalData = {
        employee: result.employee,
        salaryRecords: result.salaryRecords || [],
        attendanceRecords: result.attendanceRecords || [],
        leaveRecords: result.leaveRecords || [],
        missingPunchRecords: result.missingPunchRecords || [],
        serviceSummary: result.serviceSummary || emptyServiceSummary,
      };
      setData(portalData);
      if (portalData.employee.isSelfServiceManager) void loadManagerApplications();
      setReadNotificationIds(portalData.serviceSummary.notifications.filter((item) => item.isRead).map((item) => item.id));
      if (!preserveNavigation) {
        const initialTab: PortalTab = 'home';
        setActiveTab(initialTab);
        setTabHistory([initialTab]);
      }
      if (!preserveNavigation) {
        setWelcomeMessage(`欢迎回来，${portalData.employee.name}，工作辛苦了！`);
        window.setTimeout(() => setWelcomeMessage(''), 3600);
      }
      const latestNotice = portalData.serviceSummary.notifications[0];
      if (!preserveNavigation && latestNotice && !latestNotice.isRead) {
        setNotificationAutoOnlyLatest(true);
        setNotificationDialogOpen(true);
      }
      const salaryMonths = portalData.salaryRecords.map((record) => `${record.year}-${String(record.month_num).padStart(2, '0')}`).sort().reverse();
      setSelectedSalaryMonth(salaryMonths[0] || previousMonthKey());
      setSelectedAttendanceMonth(previousMonthKey());
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ name: normalizedName, idCard: normalizedIdCard }));
    } catch (loadError) {
      console.error('员工自助平台加载失败:', loadError);
      setError('网络连接失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionRestoreAttempted.current) return;
    sessionRestoreAttempted.current = true;
    try {
      const saved = window.localStorage.getItem(SESSION_KEY) || window.sessionStorage.getItem(SESSION_KEY);
      if (!saved) return;
      const identity = JSON.parse(saved) as { name?: string; idCard?: string };
      if (!identity.name || !identity.idCard) return;
      setName(identity.name);
      setIdCard(identity.idCard);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ name: identity.name, idCard: identity.idCard }));
      void loadPortal(identity.name, identity.idCard);
    } catch {
      // 会话数据损坏时回到登录表单，不影响正常访问。
    }
    // loadPortal intentionally reads the saved identity only once when returning from a linked form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    void fetch('/api/employee-self-service/logout', { method: 'POST' });
    setAvatarUrl('');
    setReadNotificationIds([]);
    setNotificationDialogOpen(false);
    setData(null);
    setActiveTab('home');
    setTabHistory(['home']);
    setError('');
    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch { /* 忽略本地身份清理异常。 */ }
  };

  const salaryMonths = useMemo(() => data ? [...new Set(data.salaryRecords.map((record) => `${record.year}-${String(record.month_num).padStart(2, '0')}`))].sort().reverse() : [], [data]);
  const attendanceMonths = useMemo(() => {
    if (!data) return [];
    const keys = new Set(data.attendanceRecords.map((record) => record.date.slice(0, 7)));
    data.missingPunchRecords.forEach((record) => keys.add(record.date.slice(0, 7)));
    data.leaveRecords.forEach((record) => keys.add((record.leaveStartDate || record.leaveDate).slice(0, 7)));
    keys.add(previousMonthKey());
    return [...keys].sort().reverse();
  }, [data]);
  const selectedSalary = useMemo(() => data?.salaryRecords.find((record) => `${record.year}-${String(record.month_num).padStart(2, '0')}` === selectedSalaryMonth) || null, [data, selectedSalaryMonth]);
  const dailyAttendance = useMemo<DailyAttendance[]>(() => {
    if (!data) return [];
    const grouped = new Map<string, string[]>();
    data.attendanceRecords.filter((record) => record.date.startsWith(`${selectedAttendanceMonth}-`)).forEach((record) => grouped.set(record.date, [...(grouped.get(record.date) || []), record.time]));
    const dates = new Set(grouped.keys());
    data.missingPunchRecords.filter((record) => record.date.startsWith(`${selectedAttendanceMonth}-`)).forEach((record) => dates.add(record.date));
    return [...dates].sort().reverse().map((date) => {
      const times = (grouped.get(date) || []).sort();
      const firstTime = times[0]?.slice(0, 5) || '-';
      const lastTime = times[times.length - 1]?.slice(0, 5) || '-';
      return { date, times, firstTime, lastTime, totalHours: calculateDuration(firstTime, lastTime), missing: data.missingPunchRecords.find((record) => record.date === date) };
    });
  }, [data, selectedAttendanceMonth]);
  const visibleMissing = useMemo(() => data?.missingPunchRecords.filter((record) => record.date.startsWith(`${selectedAttendanceMonth}-`)) || [], [data, selectedAttendanceMonth]);
  const missingCount = visibleMissing.reduce((total, record) => total + record.missingPeriods.length, 0);
  const latestSalary = data?.salaryRecords[0] || null;
  const attendanceDays = new Set(dailyAttendance.filter((record) => record.times.length > 0).map((record) => record.date)).size;
  const totalHours = dailyAttendance.reduce((total, record) => total + record.totalHours, 0);
  const unreadNotices = data?.serviceSummary.notifications.filter((notification) => !readNotificationIds.includes(notification.id)).length || 0;
  const socialRecords = data?.serviceSummary.socialSecurity || [];
  // “不购买社保/自愿放弃”与“购买社保”是互斥入口；已有不购买记录时不再展示历史购买记录。
  const purchaseRecords = socialRecords.length > 0 ? [] : (data?.serviceSummary.socialSecurityPurchase || []);

  const markNotificationRead = async (id: number) => {
    if (readNotificationIds.includes(id)) return;
    try {
      const response = await fetch('/api/employee-self-service/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const result = await response.json() as { success?: boolean };
      if (!response.ok || !result.success) throw new Error('已读状态保存失败，请重试');
      setReadNotificationIds(current => current.includes(id) ? current : [...current, id]);
    } catch { setError('已读状态保存失败，请重新登录后重试'); }
  };

  useEffect(() => {
    if (!signRecord) return;
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, bounds.width * ratio);
      canvas.height = Math.max(1, bounds.height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, bounds.width, bounds.height);
      context.strokeStyle = '#0f172a';
      context.lineWidth = 3;
      context.lineCap = 'round';
      context.lineJoin = 'round';
    }, 80);
    return () => window.clearTimeout(timer);
  }, [signRecord]);

  const pointerPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const startSignature = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointerPosition(event);
    const context = canvasRef.current?.getContext('2d');
    if (!point || !context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
    setIsDrawing(true);
    setHasSignature(true);
  };
  const drawSignature = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const point = pointerPosition(event);
    const context = canvasRef.current?.getContext('2d');
    if (!point || !context) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };
  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const bounds = canvas.getBoundingClientRect();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, bounds.width, bounds.height);
    setHasSignature(false);
  };
  const submitSignature = async () => {
    if (!signRecord || !data || !canvasRef.current) return;
    if (!hasSignature) {
      setError('请先在签名区域手写签名');
      return;
    }
    setSigning(true);
    try {
      const response = await fetch('/api/salary/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordId: signRecord.id, signature: canvasRef.current.toDataURL('image/png'), employeeName: data.employee.name, idCard: data.employee.id_card }) });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !result.success) { setError(result.error || '签字失败'); return; }
      setSignRecord(null);
      setHasSignature(false);
      await loadPortal(data.employee.name, data.employee.id_card);
      setActiveTab('salary');
    } catch (signError) {
      console.error('工资确认签字失败:', signError);
      setError('签字失败，请稍后重试');
    } finally { setSigning(false); }
  };

  const submitHrMessage = async () => {
    if (!data || !hrMessage.trim()) return;
    setHrSending(true);
    try {
      const response = await fetch('/api/employee-hr-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.employee.name, idCard: data.employee.id_card, message: hrMessage.trim() }),
      });
      if (!response.ok) throw new Error('发送失败');
      setHrMessage('');
      setHrSent(true);
    } catch {
      setError('HR消息发送失败，请稍后重试');
    } finally {
      setHrSending(false);
    }
  };

  if (!data) {
    return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7ff] px-4 py-10"><div className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl" /><div className="absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-cyan-200/50 blur-3xl" /><section className="employee-login-enter relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/80 bg-white/90 p-7 shadow-[0_30px_80px_rgba(37,99,235,0.16)] backdrop-blur sm:p-9"><div className="mb-8 text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-lg shadow-blue-200"><BriefcaseBusiness className="h-8 w-8" /></div><h1 className="text-2xl font-bold tracking-tight text-slate-950">聚星人事 · 员工自助平台</h1><p className="mt-2 text-sm text-slate-500">工资、考勤与员工事务一站式查询</p></div><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void loadPortal(); }}><div className="space-y-2"><Label htmlFor="employee-name">员工姓名</Label><div className="relative"><UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="employee-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入员工姓名" className="h-12 rounded-xl pl-10" autoComplete="name" /></div></div><div className="space-y-2"><Label htmlFor="employee-id-card">身份证号</Label><div className="relative"><Fingerprint className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="employee-id-card" value={idCard} onChange={(event) => setIdCard(event.target.value)} placeholder="请输入身份证号码" className="h-12 rounded-xl pl-10" autoComplete="off" /></div></div>{error && <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}<Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700">{loading ? <><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />验证中</> : <><Search className="mr-2 h-5 w-5" />进入员工平台</>}</Button></form><div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-500" />姓名与身份证号仅用于身份校验</div></section></main>;
  }

  const goBack = () => {
    setTabHistory((history) => {
      if (history.length <= 1) {
        setActiveTab('home');
        return ['home'];
      }
      const nextHistory = history.slice(0, -1);
      setActiveTab(nextHistory[nextHistory.length - 1] || 'home');
      return nextHistory.length > 0 ? nextHistory : ['home'];
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (data.employee.isSelfServiceManager && activeTab === 'reviews') {
    return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto min-h-screen max-w-md px-4 pb-8 pt-5"><PageHeader title="审核中心" subtitle={data.employee.selfServiceManagerLocation === 'workshop' ? '车间申请审核' : '办公室申请审核'} onBack={goBack} />{error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}<div className="mt-4 space-y-3">{managerApplications.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-slate-500">暂无待审核申请</p>}{managerApplications.map((item) => <div key={`${item.type}-${item.id}`} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><p className="font-semibold">{item.type}</p><p className="mt-1 text-sm text-slate-500">{item.employeeName} · {item.department || '未设置部门'}</p></div><span className="text-xs text-amber-600">{item.status}</span></div><div className="mt-3 flex gap-2"><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void reviewApplication(item.type, item.id, '已审核')}>通过</Button><Button size="sm" variant="outline" className="border-rose-200 text-rose-600" onClick={() => void reviewApplication(item.type, item.id, '已驳回')}>驳回</Button></div></div>)}</div></div></main>;
  }

  if (embeddedFlow) {
    return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-md"><div className="sticky top-0 z-50 flex items-center gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur"><button type="button" onClick={() => { setEmbeddedFlow(null); if (name.trim() && idCard.trim()) void loadPortal(name, idCard, true); }} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700" aria-label="返回员工平台"><ArrowLeft className="h-5 w-5" /></button><div><p className="text-xs text-slate-500">员工自助平台</p><h1 className="font-bold">{embeddedFlow === 'item-claim' ? '物品领用' : embeddedFlow === 'leave' ? '请假申请' : embeddedFlow === 'resignation' ? '离职申请' : embeddedFlow === 'work-certificate' ? '工作证明' : embeddedFlow === 'regularization' ? '转正申请' : '社保管理'}</h1></div></div>{embeddedFlow === 'item-claim' ? <MobileItemClaims canManage={false} standaloneRequest initialApplicantName={employee.name} /> : embeddedFlow === 'leave' ? <LeaveRequestPage /> : embeddedFlow === 'resignation' ? <ResignationPage /> : embeddedFlow === 'work-certificate' ? <WorkCertificatePage /> : embeddedFlow === 'regularization' ? <RegularizationPage /> : <SocialSecurityPage />}</div></main>;
  }

  const employee = data.employee;
  const currentSalaryIncome = selectedSalary ? sumSalary(selectedSalary, ['base_salary', 'normal_pay', 'weekday_overtime_pay', 'weekend_overtime_pay', 'performance_allowance', 'performance_pay', 'living_subsidy', 'meal_subsidy', 'housing_subsidy', 'transport_subsidy', 'other_subsidy', 'other_pay', 'seniority_award', 'full_attendance_award', 'position_subsidy', 'work_reward', 'spring_festival_subsidy', 'social_security_subsidy']) : 0;
  const currentSalaryDeduction = selectedSalary ? Number(selectedSalary.total_deduction || sumSalary(selectedSalary, ['deduct_social_security', 'deduct_utilities', 'deduct_loan', 'deduct_urgent', 'deduct_other', 'other_deduction', 'fine', 'housing_fund', 'social_insurance', 'income_tax'])) : 0;
  const switchTab = (tab: PortalTab) => {
    if (tab === 'reviews') void loadManagerApplications();
    if (tab === 'services') void loadPortal(name, idCard, true);
    setActiveTab(tab);
    setTabHistory((history) => history[history.length - 1] === tab ? history : [...history, tab]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0,#f6f8fc_38%,#eef2f7_100%)] text-slate-950 sm:py-8">{welcomeMessage && <div className="employee-scale-in fixed inset-x-4 top-4 z-[80] mx-auto max-w-[440px] rounded-2xl border border-blue-100 bg-white/95 px-4 py-3 text-center text-sm font-semibold text-blue-700 shadow-xl backdrop-blur">{welcomeMessage}</div>}{error && <div className="fixed inset-x-4 top-4 z-[70] mx-auto max-w-[440px] rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-lg">{error}</div>}<div className="relative mx-auto min-h-screen w-full max-w-[480px] overflow-hidden bg-[#f4f7fb] shadow-[0_0_70px_rgba(15,23,42,0.18)] sm:min-h-[calc(100vh-4rem)] sm:rounded-[34px] sm:border sm:border-white"><div key={activeTab} className="employee-page-enter min-h-screen pb-24 sm:min-h-[calc(100vh-4rem)]">
    {activeTab === 'home' && <><header className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 px-5 pb-20 pt-6 text-white"><div className="absolute -right-10 -top-16 h-52 w-52 rounded-full border-[34px] border-white/10" /><div className="relative flex items-start justify-between"><div><p className="text-2xl font-bold">你好，{employee.name} 👋</p><p className="mt-1 text-sm text-blue-100">欢迎回来，今天也要元气满满！</p></div><button type="button" onClick={() => setNotificationDialogOpen(true)} className="relative rounded-xl bg-white/15 p-2.5 backdrop-blur" aria-label="查看通知"><Bell className="h-5 w-5" />{unreadNotices > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-5">{unreadNotices}</span>}</button></div></header><div className="relative -mt-14 space-y-4 px-4"><section className="rounded-3xl border border-white bg-white/95 p-4 shadow-lg shadow-blue-950/5"><div className="flex items-center gap-3"><AvatarMark name={employee.name} gender={employee.gender} large src={avatarUrl} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{employee.name}</h2><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">正式员工</span></div><p className="mt-1 truncate text-sm text-slate-500">{employee.department || '未设置部门'} · {employee.position || '员工'}</p><p className="mt-1 text-xs text-slate-400">工号：{employee.employee_id || employee.id}</p></div><button type="button" onClick={() => switchTab('profile')} className="flex items-center text-xs font-medium text-blue-600">个人信息<ChevronRight className="h-4 w-4" /></button></div></section><div className="grid grid-cols-2 gap-3"><MetricCard label="最近实发工资" value={latestSalary ? formatMoney(latestSalary.actual_amount) : '暂无'} icon={<WalletCards className="h-5 w-5" />} /><MetricCard label={`${monthLabel(selectedAttendanceMonth)}出勤`} value={`${attendanceDays} 天`} icon={<CalendarDays className="h-5 w-5" />} /></div><section className="rounded-3xl bg-white p-4 shadow-sm"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">常用功能</h3><span className="text-xs text-slate-400">一站式员工服务</span></div><div className="grid grid-cols-3 gap-3">{[
      ...(employee.isSelfServiceManager ? [{ label: '审核中心', icon: <ShieldCheck />, tab: 'reviews' as PortalTab, color: 'from-blue-600 to-cyan-500' }] : []),
      { label: '物品领用', icon: <Package />, tab: 'services' as PortalTab, color: 'from-sky-500 to-blue-600', flow: 'item-claim' as const }, { label: '工资', icon: <HandCoins />, tab: 'salary' as PortalTab, color: 'from-blue-500 to-indigo-600' }, { label: '工时', icon: <Clock3 />, tab: 'work-hours' as PortalTab, color: 'from-indigo-500 to-violet-600' }, { label: '打卡记录', icon: <MapPin />, tab: 'attendance' as PortalTab, color: 'from-cyan-500 to-sky-600' }, { label: '社保管理', icon: <ShieldCheck />, tab: 'services' as PortalTab, color: 'from-teal-500 to-emerald-600', service: 'social-security' as ServiceTab }, { label: '协议管理', icon: <FileCheck2 />, tab: 'services' as PortalTab, color: 'from-violet-500 to-purple-600', service: 'agreement' as ServiceTab }, { label: '请假管理', icon: <CalendarDays />, tab: 'services' as PortalTab, color: 'from-emerald-500 to-green-600', service: 'leave' as ServiceTab }, { label: '离职申请', icon: <LogOut />, tab: 'services' as PortalTab, color: 'from-rose-500 to-orange-500', flow: 'resignation' as const }, { label: '工作证明', icon: <FileText />, tab: 'services' as PortalTab, color: 'from-sky-500 to-blue-500', flow: 'work-certificate' as const }, { label: '转正申请', icon: <CheckCircle2 />, tab: 'services' as PortalTab, color: 'from-amber-500 to-orange-500', flow: 'regularization' as const },
    ].map((item) => <button key={item.label} type="button" onClick={() => { if (item.flow) { setEmbeddedFlow(item.flow); return; } if (item.service) setServiceTab(item.service); switchTab(item.tab); }} className="rounded-2xl bg-slate-50 px-2 py-4 text-center transition hover:-translate-y-0.5 hover:bg-blue-50"><span className={`mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} text-white shadow-sm [&>svg]:h-5 [&>svg]:w-5`}>{item.icon}</span><span className="text-xs font-medium text-slate-700">{item.label}</span></button>)}</div></section>{visibleMissing.length > 0 && <button type="button" onClick={() => setMissingDialogOpen(true)} className="flex w-full items-center gap-3 rounded-3xl border border-rose-100 bg-rose-50 p-4 text-left shadow-sm"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-600"><TimerReset className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-rose-700">{monthLabel(selectedAttendanceMonth)}有 {missingCount} 次缺卡</span><span className="mt-1 block text-xs text-rose-500">请查看缺卡日期和对应时间段</span></span><ChevronRight className="h-5 w-5 text-rose-400" /></button>}<section className="overflow-hidden rounded-3xl bg-white shadow-sm"><div className="flex items-center justify-between p-4"><div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-blue-600" /><h3 className="font-bold">公司最新通知</h3></div><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">最新</span></div>{data.serviceSummary.notifications.length > 0 ? <button type="button" onClick={() => { markNotificationRead(data.serviceSummary.notifications[0].id); setNotificationAutoOnlyLatest(false); setNotificationDialogOpen(true); }} className="block w-full border-t border-slate-100 px-4 py-3 text-left transition hover:bg-blue-50"><p className="text-sm font-semibold">{data.serviceSummary.notifications[0].title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{data.serviceSummary.notifications[0].content || '请及时查看公司通知。'}</p><p className="mt-2 text-[10px] text-slate-400">{displayDate(data.serviceSummary.notifications[0].createdAt)}</p></button> : <p className="border-t border-slate-100 px-4 py-5 text-center text-sm text-slate-400">暂无新通知</p>}</section></div></>}
    {activeTab === 'salary' && <section className="px-4 pb-4 pt-5"><PageHeader title="工资" subtitle="薪资明细清晰透明" onBack={goBack} /><MonthSelect value={selectedSalaryMonth} options={salaryMonths} onChange={setSelectedSalaryMonth} />{selectedSalary ? <div className="mt-4 space-y-4"><div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 p-5 text-white shadow-xl shadow-blue-200"><div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border-[26px] border-white/10" /><div className="relative flex items-start justify-between"><div><p className="text-xs text-blue-100">{monthLabel(selectedSalaryMonth)}实发工资</p><p className="mt-2 text-4xl font-bold tracking-tight">{formatMoney(selectedSalary.actual_amount)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selectedSalary.signature ? 'bg-emerald-400/25 text-emerald-50' : 'bg-amber-300/25 text-amber-50'}`}>{selectedSalary.signature ? '已确认' : '待确认'}</span></div><div className="relative mt-6 grid grid-cols-3 gap-2 border-t border-white/20 pt-4 text-center"><div><p className="text-[10px] text-blue-100">应发合计</p><p className="mt-1 text-sm font-bold">{formatMoney(selectedSalary.total_payable || currentSalaryIncome)}</p></div><div><p className="text-[10px] text-blue-100">扣款合计</p><p className="mt-1 text-sm font-bold">{formatMoney(currentSalaryDeduction)}</p></div><div><p className="text-[10px] text-blue-100">出勤天数</p><p className="mt-1 text-sm font-bold">{selectedSalary.actual_attend_days || 0} 天</p></div></div></div><SalaryBreakdown title="应发项目" tone="blue" rows={[["基本工资", selectedSalary.base_salary], ["正常工资", selectedSalary.normal_pay], ["平时加班", selectedSalary.weekday_overtime_pay], ["周末加班", selectedSalary.weekend_overtime_pay], ["绩效工资", selectedSalary.performance_pay || selectedSalary.performance_allowance], ["生活/餐补", Number(selectedSalary.living_subsidy || 0) + Number(selectedSalary.meal_subsidy || 0)], ["其他补贴", Number(selectedSalary.other_subsidy || 0) + Number(selectedSalary.other_pay || 0)]]} total={selectedSalary.total_payable || currentSalaryIncome} /><SalaryBreakdown title="扣款项目" tone="rose" rows={[["个人社保", Number(selectedSalary.deduct_social_security || 0) + Number(selectedSalary.social_insurance || 0)], ["公积金", selectedSalary.housing_fund], ["个税", selectedSalary.income_tax], ["水电费", selectedSalary.deduct_utilities], ["其他扣款", Number(selectedSalary.deduct_other || 0) + Number(selectedSalary.other_deduction || 0) + Number(selectedSalary.fine || 0)]]} total={currentSalaryDeduction} />{!selectedSalary.signature ? <Button onClick={() => { setHasSignature(false); setSignRecord(selectedSalary); }} className="h-12 w-full rounded-2xl bg-blue-600 font-semibold hover:bg-blue-700"><FileCheck2 className="mr-2 h-5 w-5" />签字确认本月工资</Button> : <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" /><div><p className="font-semibold">本月工资已签字确认</p><p className="text-xs text-emerald-600">确认时间：{displayDate(selectedSalary.signature_time)}</p></div></div>}</div> : <EmptyState icon={<ReceiptText />} title="本月暂无工资记录" description="可切换其他月份查看" />}</section>}
    {activeTab === 'work-hours' && <section className="px-4 pb-4 pt-5"><PageHeader title="工时" subtitle="仅查看每日工时统计" onBack={goBack} /><MonthSelect value={selectedAttendanceMonth} options={attendanceMonths} onChange={setSelectedAttendanceMonth} /><div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-700"><p className="font-semibold text-blue-800">注意事项</p><p className="mt-1">工时按当天有效打卡记录计算，仅展示工时统计，不显示具体打卡时间。</p></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white p-4 text-center shadow-sm"><p className="text-2xl font-bold text-blue-600">{attendanceDays}</p><p className="mt-1 text-xs text-slate-500">出勤天数</p></div><div className="rounded-2xl bg-white p-4 text-center shadow-sm"><p className="text-2xl font-bold text-cyan-600">{totalHours.toFixed(1)}</p><p className="mt-1 text-xs text-slate-500">总工时</p></div></div><div className="mt-4 space-y-3">{dailyAttendance.length > 0 ? dailyAttendance.map((record) => <article key={record.date} className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm"><div><p className="font-bold">{record.date.slice(5).replace('-', '月')}日</p><p className="mt-1 text-xs text-slate-400">{record.missing ? '存在缺卡' : '正常出勤'}</p></div><p className="text-lg font-bold text-slate-800">{record.totalHours.toFixed(1)}<span className="ml-1 text-xs font-normal text-slate-400">小时</span></p></article>) : <EmptyState icon={<Clock3 />} title="本月暂无工时记录" description="可切换其他月份查看" />}</div></section>}{activeTab === 'attendance' && <section className="px-4 pb-4 pt-5"><PageHeader title="工时与打卡" subtitle="考勤记录实时掌握" onBack={goBack} /><MonthSelect value={selectedAttendanceMonth} options={attendanceMonths} onChange={(value) => { setSelectedAttendanceMonth(value); }} /><div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-700"><p className="font-semibold text-blue-800">注意事项</p><p className="mt-1">系统会按个人设置的上班、下班时间判断缺卡；下班时间之后的打卡均计为有效下班卡。点击下方日期可查看当天全部打卡记录。</p></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-white p-3 text-center shadow-sm"><p className="text-xl font-bold text-blue-600">{attendanceDays}</p><p className="mt-1 text-[10px] text-slate-500">出勤天数</p></div><div className="rounded-2xl bg-white p-3 text-center shadow-sm"><p className="text-xl font-bold text-cyan-600">{totalHours.toFixed(1)}</p><p className="mt-1 text-[10px] text-slate-500">估算工时</p></div><button type="button" onClick={() => setMissingDialogOpen(true)} className="rounded-2xl bg-white p-3 text-center shadow-sm"><p className={`text-xl font-bold ${missingCount ? 'text-rose-600' : 'text-emerald-600'}`}>{missingCount}</p><p className="mt-1 text-[10px] text-slate-500">缺卡次数</p></button></div><div className="mt-4 space-y-3">{dailyAttendance.length > 0 ? dailyAttendance.map((record) => <article key={record.date} role="button" tabIndex={0} onClick={() => { setExpandedAttendanceDate((current) => current === record.date ? null : record.date); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setExpandedAttendanceDate((current) => current === record.date ? null : record.date); }} className={`cursor-pointer rounded-3xl border bg-white p-4 shadow-sm transition hover:shadow-md ${record.missing ? 'border-rose-200' : 'border-slate-100'}`}><div className="flex items-start justify-between"><div><p className="font-bold">{record.date.slice(5).replace('-', '月')}日</p><p className="mt-1 text-xs text-slate-400">共 {record.times.length} 次打卡</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${record.missing ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{record.missing ? '需要补卡' : '正常出勤'}</span></div><div className="relative mt-4 space-y-4 pl-7 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-slate-200"><div className="relative flex items-center justify-between"><span className="absolute -left-7 h-3.5 w-3.5 rounded-full border-4 border-blue-100 bg-blue-600" /><p className="font-semibold">{record.firstTime}</p><span className="text-xs text-slate-400">标准 {employee.attendance_check_in_time || '08:30'}</span></div><div className="relative flex items-center justify-between"><span className="absolute -left-7 h-3.5 w-3.5 rounded-full border-4 border-cyan-100 bg-cyan-500" /><p className="font-semibold">{record.lastTime}</p><span className="text-xs text-slate-400">约 {record.totalHours.toFixed(1)} 小时</span></div></div>{expandedAttendanceDate === record.date && <div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="mb-2 text-xs font-semibold text-slate-500">全部打卡记录（{record.times.length} 次）</p><div className="grid grid-cols-2 gap-2">{record.times.map((time, index) => <span key={`${time}-${index}`} className="rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700 shadow-sm">{time.slice(0, 5)}</span>)}</div></div>}{record.missing && <div className="mt-4 flex flex-wrap gap-1.5">{record.missing.missingPeriods.map((period) => <span key={period} className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-600">缺 {missingPunchLabel(period, record.missing)}</span>)}</div>}</article>) : <EmptyState icon={<Clock3 />} title="本月暂无打卡记录" description="可切换其他月份查看" />}</div></section>}
    {activeTab === 'services' && <section className="px-4 pb-4 pt-5"><PageHeader title="事务服务" subtitle="请假、社保与协议一站式管理" onBack={goBack} /><div className="mt-4 grid grid-cols-3 rounded-2xl bg-slate-200/70 p-1">{([['leave', '请假管理'], ['social-security', '社保管理'], ['agreement', '协议管理']] as Array<[ServiceTab, string]>).map(([value, label]) => <button key={value} type="button" onClick={() => setServiceTab(value)} className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition ${serviceTab === value ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>{serviceTab === 'leave' && <div className="mt-4 space-y-3"><ServiceAction icon={<CalendarDays />} title="提交请假申请" description="填写请假时间、类型并完成签字" action="去申请" onClick={() => setEmbeddedFlow('leave')} /><ServiceAction icon={<LogOut />} title="离职申请" description="填写离职日期、类型和原因并提交审核" action="去申请" onClick={() => setEmbeddedFlow('resignation')} /><ServiceAction icon={<FileText />} title="工作证明" description="申请开具在职工作证明" action="去申请" onClick={() => setEmbeddedFlow('work-certificate')} /><ServiceAction icon={<CheckCircle2 />} title="转正申请" description="填写转正信息并提交审核" action="去申请" onClick={() => setEmbeddedFlow('regularization')} /><button type="button" onClick={() => setApplicationDrawerOpen(true)} className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">查看全部申请记录</button>{(data.serviceSummary.resignationRecords || []).map((record) => <RecordCard key={record.id} title="离职申请" status={record.status} lines={[displayDate(record.createdAt)]} />)}{(data.serviceSummary.workCertificateRecords || []).map((record) => <RecordCard key={record.id} title="工作证明" status={record.status} lines={[displayDate(record.createdAt)]} />)}{(data.serviceSummary.regularizationRecords || []).map((record) => <RecordCard key={record.id} title="转正申请" status={record.status} lines={[displayDate(record.createdAt)]} />)}{data.leaveRecords.length > 0 ? data.leaveRecords.slice(0, 10).map((record) => <RecordCard key={record.id} title={record.leaveType || '请假申请'} status={record.status} lines={[`${displayDate(record.leaveStartDate || record.leaveDate)} 至 ${displayDate(record.leaveEndDate || record.leaveDate)}`, record.reason || '未填写原因']} />) : ((data.serviceSummary.resignationRecords || []).length === 0 && (data.serviceSummary.workCertificateRecords || []).length === 0 && (data.serviceSummary.regularizationRecords || []).length === 0 ? <EmptyState icon={<CalendarDays />} title="暂无申请记录" description="需要申请时可在线提交" /> : null)}</div>}{serviceTab === 'social-security' && <div className="mt-4 space-y-3">{socialRecords.length === 0 && purchaseRecords.length === 0 && <><ServiceAction icon={<ShieldCheck />} title="社保管理" description="填写不购买社保申请书与自愿放弃声明" action="去办理" onClick={() => { if (!data.serviceSummary.onboarding) { setError('请先完成入职登记，才能填写社保申请'); return; } setEmbeddedFlow('social'); }} /><ServiceAction icon={<HandCoins />} title="购买社保" description="提交购买社保申请，由管理员审核办理" action="提交申请" onClick={() => { if (!data.serviceSummary.onboarding) { setError('请先完成入职登记，才能申请购买社保'); return; } setHrMessage('我申请购买社保，请管理员审核办理。'); setHrSent(false); setHrDialogOpen(true); }} /></>}{socialRecords.length > 0 && <div className="space-y-2"><p className="px-1 text-xs font-semibold text-slate-500">社保管理记录</p>{socialRecords.map((record) => <RecordCard key={record.id} title={socialSecurityTitle(record.documentType)} status={record.status} lines={[displayDate(record.applicationDate || record.createdAt)]} />)}</div>}{purchaseRecords.length > 0 && <div className="space-y-2"><p className="px-1 text-xs font-semibold text-slate-500">购买社保记录</p>{purchaseRecords.map((record) => <RecordCard key={record.id} title="购买社保" status={record.status} lines={[record.insuranceStatus || '已提交管理员审核', displayDate(record.createdAt)]} />)}</div>}</div>}{serviceTab === 'agreement' && <div className="mt-4 space-y-3"><div className="rounded-3xl bg-gradient-to-br from-violet-600 to-blue-600 p-5 text-white shadow-lg shadow-violet-200"><FileCheck2 className="h-8 w-8" /><h3 className="mt-4 text-lg font-bold">员工协议中心</h3><p className="mt-1 text-sm text-violet-100">查看入职登记与保密协议确认状态</p></div>{data.serviceSummary.onboarding ? <RecordCard title="入职登记与保密协议" status={data.serviceSummary.onboarding.confidentialityConfirmed ? '已确认' : data.serviceSummary.onboarding.status} lines={[`提交日期：${displayDate(data.serviceSummary.onboarding.createdAt)}`, data.serviceSummary.onboarding.confidentialityConfirmed ? '保密协议已签字确认' : '保密协议尚未确认']} /> : <EmptyState icon={<FileText />} title="暂无协议记录" description="完成入职登记后将在这里显示" />}</div>}<button type="button" onClick={() => { setHrDialogOpen(true); setHrSent(false); }} className="mt-4 flex w-full items-center gap-3 rounded-3xl border border-blue-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><MessageCircleMore className="h-5 w-5" /></span><span className="flex-1"><span className="block font-bold">HR 在线服务</span><span className="mt-1 block text-xs text-slate-500">点击提交问题，联系公司人事管理员</span></span><ChevronRight className="h-5 w-5 text-blue-400" /></button><Dialog open={hrDialogOpen} onOpenChange={setHrDialogOpen}><DialogContent className="max-w-md rounded-3xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><MessageCircleMore className="h-5 w-5 text-blue-600" />HR 在线服务</DialogTitle><DialogDescription>提交后，HR 可在后台聊天记录中查看并回复。</DialogDescription></DialogHeader>{hrSent ? <div className="rounded-2xl bg-emerald-50 p-5 text-center text-sm text-emerald-700"><CheckCircle2 className="mx-auto mb-2 h-8 w-8" /><p className="font-semibold">消息已提交</p><p className="mt-1 text-xs">HR 会尽快处理你的问题。</p></div> : <div className="space-y-3"><textarea value={hrMessage} onChange={(event) => setHrMessage(event.target.value)} placeholder="请输入需要咨询的问题" className="min-h-32 w-full resize-none rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><Button type="button" disabled={hrSending || !hrMessage.trim()} onClick={() => void submitHrMessage()} className="h-11 w-full rounded-xl bg-blue-600">{hrSending ? '提交中…' : '提交给 HR'}</Button></div>}</DialogContent></Dialog></section>}
    {activeTab === 'profile' && <section className="px-4 pb-4 pt-5"><PageHeader title="我的" subtitle="个人档案与账号安全" onBack={goBack} /><div className="mt-4 rounded-3xl bg-gradient-to-br from-blue-700 to-cyan-500 p-5 text-white shadow-lg shadow-blue-200"><div className="flex items-center gap-4"><div className="relative"><AvatarMark name={employee.name} gender={employee.gender} large src={avatarUrl} /><label className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white text-blue-600 shadow"><input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" /><span className="text-xs">+</span></label></div><div><p className="text-xl font-bold">{employee.name}</p><p className="mt-1 text-sm text-blue-100">{employee.department || '-'} · {employee.position || '员工'}</p><span className="mt-2 inline-block rounded-full bg-white/15 px-2.5 py-1 text-[10px]">{employee.status || '在职'}</span></div></div></div><div className="mt-4 overflow-hidden rounded-3xl bg-white shadow-sm">{employee.isSelfServiceManager && <ProfileRow icon={<ShieldCheck />} label="员工自助平台身份" value={employee.selfServiceManagerLocation === 'workshop' ? '车间管理者' : '办公室管理者'} />}<ProfileRow icon={<IdCard />} label="身份证号" value={maskIdCard(employee.id_card)} /><ProfileRow icon={<Building2 />} label="所属部门" value={employee.department || '-'} /><ProfileRow icon={<BriefcaseBusiness />} label="岗位" value={employee.position || '-'} /><ProfileRow icon={<MapPin />} label="工作地点" value={employee.location || '-'} /><ProfileRow icon={<CalendarDays />} label="入职日期" value={displayDate(employee.hire_date)} /><ProfileRow icon={<Clock3 />} label="个人打卡时间" value={`${employee.attendance_check_in_time || '08:30'} - ${employee.attendance_check_out_time || '17:30'}`} last /></div><Button variant="outline" onClick={logout} className="mt-5 h-12 w-full rounded-2xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><LogOut className="mr-2 h-5 w-5" />退出员工平台</Button></section>}
  </div><nav className="fixed inset-x-0 bottom-0 z-40 mx-auto grid w-full max-w-[480px] grid-cols-5 border-t border-slate-200/80 bg-white/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:bottom-8 sm:rounded-b-[34px]">{([['home', '首页', Home], ['salary', '工资', WalletCards], ['attendance', '打卡', Clock3], ['services', '服务', BriefcaseBusiness], ['profile', '我的', CircleUserRound]] as Array<[PortalTab, string, typeof Home]>).map(([value, label, Icon]) => <button key={value} type="button" onClick={() => switchTab(value)} className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-medium transition ${activeTab === value ? 'text-blue-600' : 'text-slate-400'}`}><span className={`relative rounded-xl p-1.5 ${activeTab === value ? 'bg-blue-50' : ''}`}><Icon className="h-5 w-5" />{value === 'services' && unreadNotices > 0 && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-rose-500" />}</span>{label}</button>)}</nav></div>
  <Dialog open={applicationDrawerOpen} onOpenChange={setApplicationDrawerOpen}><DialogContent className="max-h-[85vh] max-w-md overflow-hidden rounded-3xl"><DialogHeader><DialogTitle>全部申请记录</DialogTitle><DialogDescription>可上下滑动查看历史申请及审核状态</DialogDescription></DialogHeader><div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">{data.leaveRecords.map((record) => <RecordCard key={`leave-${record.id}`} title="请假申请" status={record.status} lines={[`${displayDate(record.leaveStartDate || record.leaveDate)} 至 ${displayDate(record.leaveEndDate || record.leaveDate)}`]} />)}{(data.serviceSummary.resignationRecords || []).map((record) => <RecordCard key={`resign-${record.id}`} title="离职申请" status={record.status} lines={[displayDate(record.createdAt)]} />)}{(data.serviceSummary.workCertificateRecords || []).map((record) => <RecordCard key={`work-${record.id}`} title="工作证明" status={record.status} lines={[displayDate(record.createdAt)]} />)}{(data.serviceSummary.regularizationRecords || []).map((record) => <RecordCard key={`regular-${record.id}`} title="转正申请" status={record.status} lines={[displayDate(record.createdAt)]} />)}{socialRecords.map((record) => <RecordCard key={`social-${record.id}`} title={socialSecurityTitle(record.documentType)} status={record.status} lines={[displayDate(record.applicationDate || record.createdAt)]} />)}{purchaseRecords.map((record) => <RecordCard key={`purchase-${record.id}`} title="购买社保" status={record.status} lines={[displayDate(record.createdAt)]} />)}{data.leaveRecords.length === 0 && !(data.serviceSummary.resignationRecords || []).length && !(data.serviceSummary.workCertificateRecords || []).length && !(data.serviceSummary.regularizationRecords || []).length && socialRecords.length === 0 && purchaseRecords.length === 0 && <p className="py-8 text-center text-sm text-slate-400">暂无申请记录</p>}</div></DialogContent></Dialog>  <Dialog open={notificationDialogOpen} onOpenChange={setNotificationDialogOpen}><DialogContent className="max-h-[82vh] max-w-md overflow-hidden rounded-3xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-blue-600" />{notificationAutoOnlyLatest ? "最新通知" : "全部通知"}</DialogTitle><DialogDescription>公司发布的最新通知</DialogDescription></DialogHeader><div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">{data.serviceSummary.notifications.length > 0 ? (notificationAutoOnlyLatest ? data.serviceSummary.notifications.slice(0, 1) : data.serviceSummary.notifications).map((notification) => <article key={notification.id} role="button" tabIndex={0} onClick={() => markNotificationRead(notification.id)} className="cursor-pointer rounded-2xl bg-slate-50 p-4 transition hover:bg-blue-50"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-slate-900">{notification.title}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${readNotificationIds.includes(notification.id) ? "bg-slate-200 text-slate-500" : "bg-rose-100 text-rose-600"}`}>{readNotificationIds.includes(notification.id) ? "已读" : "未读"}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{notification.content || "请及时查看公司通知。"}</p>{notification.attachmentFile && <>{isImageAttachment(notification.attachmentFileName) && <img src={notificationAttachmentUrl(notification.attachmentFile)} alt={notification.attachmentFileName || "通知图片"} className="mt-3 max-h-64 w-full rounded-xl object-contain" />}<a href={notificationAttachmentUrl(notification.attachmentFile || "")} target="_blank" rel="noreferrer" className="mt-3 block rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">查看附件：{notification.attachmentFileName || "下载文件"}</a></>}<p className="mt-2 text-xs text-slate-400">{displayDate(notification.createdAt)}</p></article>) : <p className="py-6 text-center text-sm text-slate-400">暂无通知</p>}</div></DialogContent></Dialog>  <Dialog open={missingDialogOpen} onOpenChange={setMissingDialogOpen}><DialogContent className="max-h-[82vh] max-w-md overflow-hidden rounded-3xl"><DialogHeader><DialogTitle className="flex items-center gap-2 text-rose-700"><AlertCircle className="h-5 w-5" />{monthLabel(selectedAttendanceMonth)}补卡提醒</DialogTitle><DialogDescription>请按照个人上下班时间核对缺卡日期和时段。</DialogDescription></DialogHeader><div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">{visibleMissing.length > 0 ? visibleMissing.map((record) => <div key={record.date} className="rounded-2xl border border-rose-100 bg-rose-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{record.date}</span><div className="flex flex-wrap gap-1">{record.missingPeriods.map((period) => <span key={period} className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-rose-600">缺 {missingPunchLabel(period, record)}</span>)}</div></div></div>) : <p className="py-8 text-center text-sm text-slate-400">本月没有缺卡记录</p>}</div></DialogContent></Dialog>
  <Dialog open={Boolean(signRecord)} onOpenChange={(open) => { if (!open && !signing) { setSignRecord(null); setHasSignature(false); } }}><DialogContent className="max-w-md rounded-3xl"><DialogHeader><DialogTitle>工资确认签字</DialogTitle><DialogDescription>请在下方空白区域手写签名，确认后不可撤销。</DialogDescription></DialogHeader><canvas ref={canvasRef} className="h-56 w-full touch-none rounded-2xl border border-dashed border-slate-300 bg-white" onPointerDown={startSignature} onPointerMove={drawSignature} onPointerUp={() => setIsDrawing(false)} onPointerCancel={() => setIsDrawing(false)} /><div className="grid grid-cols-2 gap-3"><Button type="button" variant="outline" onClick={clearSignature} disabled={signing} className="h-11 rounded-xl"><RotateCcw className="mr-2 h-4 w-4" />清除</Button><Button type="button" onClick={submitSignature} disabled={signing || !hasSignature} className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700">{signing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}确认签字</Button></div></DialogContent></Dialog></main>;
}

function PageHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) { return <div className="flex items-center gap-3"><button type="button" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-xl font-bold">{title}</h1><p className="text-xs text-slate-500">{subtitle}</p></div></div>; }
function MonthSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) { return <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm"><CalendarDays className="ml-2 h-4 w-4 text-blue-600" /><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 flex-1 appearance-none bg-transparent px-2 text-center text-sm font-semibold outline-none">{options.length > 0 ? options.map((option) => <option key={option} value={option}>{monthLabel(option)}</option>) : <option value={value}>{monthLabel(value)}</option>}</select></div>; }
function SalaryBreakdown({ title, rows, total, tone }: { title: string; rows: Array<[string, number | undefined]>; total: number; tone: 'blue' | 'rose' }) { const visibleRows = rows.filter(([, amount]) => Number(amount || 0) !== 0); return <div className="overflow-hidden rounded-3xl bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3 font-bold">{title}</div><div className="divide-y divide-slate-50 px-4">{visibleRows.length > 0 ? visibleRows.map(([label, amount]) => <div key={label} className="flex items-center justify-between py-3 text-sm"><span className="text-slate-500">{label}</span><span className="font-semibold">{formatMoney(amount)}</span></div>) : <p className="py-5 text-center text-sm text-slate-400">暂无明细</p>}</div><div className={`flex items-center justify-between border-t px-4 py-3 text-sm font-bold ${tone === 'blue' ? 'border-blue-100 bg-blue-50 text-blue-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}><span>合计</span><span>{formatMoney(total)}</span></div></div>; }
function ServiceAction({ icon, title, description, action, onClick }: { icon: React.ReactNode; title: string; description: string; action: string; onClick: () => void }) { return <div className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 [&>svg]:h-6 [&>svg]:w-6">{icon}</span><div className="min-w-0 flex-1"><p className="font-bold">{title}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div><Button type="button" size="sm" onClick={onClick} className="rounded-xl bg-blue-600">{action}</Button></div>; }
function RecordCard({ title, status, lines }: { title: string; status: string; lines: string[] }) { return <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><p className="font-bold">{title}</p><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusTone(status)}`}>{status || '处理中'}</span></div>{lines.map((line) => <p key={line} className="mt-2 text-xs leading-5 text-slate-500">{line}</p>)}</div>; }
function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) { return <div className="mt-4 rounded-3xl bg-white px-6 py-10 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 [&>svg]:h-7 [&>svg]:w-7">{icon}</span><p className="mt-4 font-bold text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-400">{description}</p></div>; }
function ProfileRow({ icon, label, value, last = false }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) { return <div className={`flex items-center gap-3 px-4 py-4 ${last ? '' : 'border-b border-slate-100'}`}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><span className="flex-1 text-sm text-slate-500">{label}</span><span className="max-w-[55%] text-right text-sm font-semibold text-slate-800">{value}</span></div>; }
