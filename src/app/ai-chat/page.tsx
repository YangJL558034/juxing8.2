'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Bot, User, Loader2, Trash2, Copy, Check } from 'lucide-react';
import { formatChinaTime } from '@/lib/china-time';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatUser {
  id: number;
  username: string;
  name: string;
  role: string;
  department?: string;
}

const welcomeMessage: Message = {
  id: '1',
  role: 'assistant',
  content: `👋 您好！我是您的智能助手。

我可以帮您：
• 📝 生成和管理注册码
• 👥 查询用户和客户信息
• 💼 查看商机和合同数据
• 📋 了解审批流程
• 🏢 查看组织架构

请直接用自然语言告诉我您需要什么帮助，或者点击下方的快捷问题快速开始！`,
  timestamp: new Date(),
};

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [user, setUser] = useState<AIChatUser | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 调试：打印用户信息
  console.log('AIChatPage - 用户信息:', user);

  // 加载当前登录用户
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          if (!cancelled) {
            setMessages([welcomeMessage]);
            setLoadingHistory(false);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled && data?.success && data.user) {
          setUser(data.user as AIChatUser);
        } else if (!cancelled) {
          setMessages([welcomeMessage]);
          setLoadingHistory(false);
        }
      } catch (error) {
        console.error('AIChatPage - 加载用户信息失败:', error);
        if (!cancelled) {
          setMessages([welcomeMessage]);
          setLoadingHistory(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 加载历史聊天记录
  useEffect(() => {
    console.log('AIChatPage - useEffect触发，user.id:', user?.id);
    if (user?.id) {
      loadChatHistory();
    } else {
      console.log('AIChatPage - 无用户信息，显示欢迎消息');
      // 仅在用户加载阶段已结束且仍无 user 时显示欢迎消息
      // （避免初始挂载时还没拿到 user 就覆盖）
    }
  }, [user?.id]);

  // 加载历史聊天记录
  const loadChatHistory = async () => {
    if (!user?.id) return;
    
    console.log('AIChatPage - 开始加载聊天记录，userId:', user.id);
    try {
      const res = await fetch(`/api/chat/messages?userId=${user.id}`);
      console.log('AIChatPage - 获取聊天记录响应状态:', res.status);
      const data = await res.json();
      console.log('AIChatPage - 获取聊天记录响应数据:', data);
      
      if (data.success && data.messages.length > 0) {
        const historyMessages: Message[] = data.messages.map((msg: any) => ({
          id: msg.id.toString(),
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: new Date(msg.created_at),
        }));
        console.log('AIChatPage - 解析历史消息:', historyMessages);
        setMessages(historyMessages);
      } else {
        console.log('AIChatPage - 无历史记录，显示欢迎消息');
        setMessages([welcomeMessage]);
      }
    } catch (error) {
      console.error('AIChatPage - 加载聊天记录失败:', error);
      setMessages([welcomeMessage]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 保存聊天消息
  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!user?.id) {
      console.log('AIChatPage - 无法保存消息：无用户信息');
      return;
    }
    
    console.log('AIChatPage - 开始保存消息:', { userId: user.id, role, content: content.substring(0, 50) });
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          role,
          content,
        }),
      });
      const data = await res.json();
      console.log('AIChatPage - 保存消息响应:', data);
    } catch (error) {
      console.error('AIChatPage - 保存聊天记录失败:', error);
    }
  };

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 处理发送消息
  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // 保存用户消息
      await saveMessage('user', userMessage.content);

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: userMessage.content }),
      });

      const data = await res.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || data.result || '处理完成',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // 保存助手消息
      await saveMessage('assistant', assistantMessage.content);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，服务暂时不可用，请稍后重试。',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);

      // 保存错误消息
      await saveMessage('assistant', errorMessage.content);
    } finally {
      setLoading(false);
    }
  };

  // 快捷问题
  const quickQuestions = [
    { label: '查询注册码', command: '查询注册码' },
    { label: '生成注册码', command: '生成5个注册码' },
    { label: '查看客户', command: '查看客户' },
    { label: '客户统计', command: '客户总数是多少' },
    { label: '商机统计', command: '商机统计' },
    { label: '待审批数量', command: '待审批有多少' },
    { label: '组织架构', command: '查看组织架构' },
    { label: '帮助', command: '帮助' },
  ];

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 清空对话
  const handleClear = async () => {
    const newWelcomeMessage: Message = {
      id: '1',
      role: 'assistant',
      content: `👋 对话已清空！

我可以帮您：
• 📝 生成和管理注册码
• 👥 查询用户和客户信息
• 💼 查看商机和合同数据
• 📋 了解审批流程
• 🏢 查看组织架构

请告诉我您需要什么帮助？`,
      timestamp: new Date(),
    };

    setMessages([newWelcomeMessage]);

    // 清空数据库中的记录
    if (user?.id) {
      try {
        await fetch(`/api/chat/messages?userId=${user.id}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('清空聊天记录失败:', error);
      }
    }
  };

  // 复制消息内容
  const handleCopy = (message: Message) => {
    navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 格式化时间
  const formatTime = (date: Date) => {
    return formatChinaTime(date);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="flex-shrink-0 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Bot className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">AI 对话助手</CardTitle>
                <p className="text-sm text-muted-foreground">智能生成管理助手</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                在线
              </Badge>
              <Button variant="outline" size="sm" onClick={handleClear}>
                <Trash2 className="w-4 h-4 mr-1" />
                清空
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center h-full py-8">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>加载历史记录中...</span>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === 'user' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        message.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {message.role === 'user' ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>

                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                      <div
                        className={`flex items-center justify-end gap-2 mt-2 ${
                          message.role === 'user' ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        <span className="text-xs">{formatTime(message.timestamp)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 w-6 p-0 ${
                            message.role === 'user' ? 'text-blue-100 hover:text-white' : ''
                          }`}
                          onClick={() => handleCopy(message)}
                        >
                          {copiedId === message.id ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {!loadingHistory && loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-slate-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">正在处理...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="p-4 border-t bg-slate-50">
            {/* 快捷问题 */}
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-2">💡 快捷问题：</p>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((q, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setInput(q.command);
                      // 自动发送
                      setTimeout(() => {
                        handleSend();
                      }, 100);
                    }}
                  >
                    {q.label}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                placeholder="输入您的问题，我帮您解答..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={!input.trim() || loading}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              按 Enter 发送，Shift + Enter 换行
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
