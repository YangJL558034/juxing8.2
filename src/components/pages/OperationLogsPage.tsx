'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Search, FileText, User, Monitor, Smartphone, Globe, Calendar, ChevronDown, RefreshCw } from 'lucide-react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { formatChinaDateTime, parseChinaTime } from '@/lib/china-time';

interface OperationLog {
  id: number;
  user_id: number | null;
  user_name: string;
  module: string;
  action: string;
  details: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const moduleLabels: Record<string, string> = {
  employee_query: '员工自助查询',
  salary: '工资管理',
  employee: '员工管理',
  asset: '资产管理',
  user: '用户管理',
  auth: '认证登录',
  system: '系统设置',
  // ===== 小程序端 =====
  personnel: '人事管理',
  'account-cancels': '账号注销申请',
  leave: '请假申请',
  resignation: '离职申请',
  regularization: '转正申请',
  certificate: '在职证明',
  item_claim: '物品领用',
  attendance: '考勤打卡',
  mini_program: '小程序',
};

const actionColors: Record<string, string> = {
  login: 'bg-green-100 text-green-800',
  logout: 'bg-gray-100 text-gray-800',
  view: 'bg-blue-100 text-blue-800',
  create: 'bg-emerald-100 text-emerald-800',
  update: 'bg-yellow-100 text-yellow-800',
  delete: 'bg-red-100 text-red-800',
  sign: 'bg-purple-100 text-purple-800',
  export: 'bg-cyan-100 text-cyan-800',
  import: 'bg-indigo-100 text-indigo-800',
};

export default function OperationLogsPage() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  const fetchLogs = async () => {
    setLoading(true);
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      });
      if (moduleFilter && moduleFilter !== 'all') {
        params.append('module', moduleFilter);
      }

      const response = await fetch(`/api/operation-logs?${params}`);
      const data = await response.json();

      if (data.success) {
        setLogs(data.data.logs);
        setPagination(data.data.pagination);
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // 自动刷新 - 每20秒更新一次日志
  const { refreshNow } = useAutoRefresh({
    enabled: true,
    interval: 20000,
    onRefresh: fetchLogs,
  });

  useEffect(() => {
    fetchLogs();
  }, [pagination.page, moduleFilter]);

  const parseDetails = (details: string) => {
    try {
      return JSON.parse(details);
    } catch {
      return details;
    }
  };

  const formatDateTime = (dateStr: string) => {
    return formatChinaDateTime(dateStr);
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      log.user_name.toLowerCase().includes(searchLower) ||
      log.module.toLowerCase().includes(searchLower) ||
      log.action.toLowerCase().includes(searchLower) ||
      (log.ip_address && log.ip_address.includes(searchTerm))
    );
  });

  // 按时间分组的日志记录
  const groupedLogs = useMemo(() => {
    const groups: { [key: string]: OperationLog[] } = {};
    
    filteredLogs.forEach(log => {
      const date = parseChinaTime(log.created_at) || new Date(log.created_at);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}年${month}月`;
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(log);
    });
    
    // 按时间倒序排序（最新的在前面）
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const [yearA, monthA] = a.match(/(\d+)年(\d+)月/)!.slice(1).map(Number);
      const [yearB, monthB] = b.match(/(\d+)年(\d+)月/)!.slice(1).map(Number);
      if (yearB !== yearA) return yearB - yearA;
      return monthB - monthA;
    });
    
    return sortedKeys.map(key => ({
      key,
      logs: groups[key].sort((a, b) => 
        (parseChinaTime(b.created_at)?.getTime() || 0) - (parseChinaTime(a.created_at)?.getTime() || 0)
      )
    }));
  }, [filteredLogs]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              操作日志
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              共 {pagination.total} 条记录
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* 筛选条件 */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索用户、模块、IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="选择模块" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模块</SelectItem>
                <SelectItem value="employee_query">员工自助查询</SelectItem>
                <SelectItem value="salary">工资管理</SelectItem>
                <SelectItem value="employee">员工管理</SelectItem>
                <SelectItem value="asset">资产管理</SelectItem>
                <SelectItem value="user">用户管理</SelectItem>
                <SelectItem value="auth">认证登录</SelectItem>
                <SelectItem value="system">系统设置</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={refreshNow}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>

          {/* 日志表格 */}
          <div className="space-y-4">
            {loading ? (
              <div className="border rounded-lg">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        加载中...
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : groupedLogs.length === 0 ? (
              <div className="border rounded-lg">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        暂无日志记录
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {groupedLogs.map((group) => (
                  <AccordionItem key={group.key} value={group.key} className="border rounded-lg overflow-hidden mb-4">
                    <AccordionTrigger className="hover:no-underline bg-slate-50 hover:bg-slate-100 px-4 py-3">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-blue-500" />
                          <span className="font-medium">{group.key}</span>
                          <Badge variant="secondary" className="ml-2">
                            {group.logs.length} 条
                          </Badge>
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-0">
                      <div className="border-t">
                        <Table>
                          <TableHeader className="bg-slate-50/50">
                            <TableRow>
                              <TableHead className="w-[160px]">时间</TableHead>
                              <TableHead className="w-[100px]">用户</TableHead>
                              <TableHead className="w-[120px]">模块</TableHead>
                              <TableHead className="w-[100px]">操作</TableHead>
                              <TableHead>详情</TableHead>
                              <TableHead className="w-[140px]">IP地址</TableHead>
                              <TableHead className="w-[200px]">设备信息</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.logs.map((log) => {
                              const details = parseDetails(log.details);
                              return (
                                <TableRow key={log.id}>
                                  <TableCell className="text-sm">
                                    {formatDateTime(log.created_at)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <User className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-medium">{log.user_name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {moduleLabels[log.module] || log.module}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={actionColors[log.action] || ''}>
                                      {log.action}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="max-w-[300px] truncate text-sm text-muted-foreground">
                                      {typeof details === 'object'
                                        ? details.message || JSON.stringify(details)
                                        : details}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <Globe className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-sm font-mono">
                                        {log.ip_address || '-'}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {log.user_agent === '小程序' ? (
                                        <>
                                          <Smartphone className="h-4 w-4 text-emerald-600 shrink-0" />
                                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">小程序</span>
                                        </>
                                      ) : (
                                        <>
                                          <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                                          <span className="text-sm truncate max-w-[160px]" title={log.user_agent || ''}>
                                            {log.user_agent
                                              ? log.user_agent.split(')').pop()?.trim().split(' ')[0] || log.user_agent.substring(0, 30)
                                              : '网页'}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>

          {/* 分页 */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                第 {pagination.page} 页，共 {pagination.totalPages} 页
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 rounded border disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page === pagination.totalPages}
                  className="px-3 py-1 rounded border disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
