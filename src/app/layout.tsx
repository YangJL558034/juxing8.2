import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { ToastContextProvider } from '@/components/ToastContextProvider';

export const metadata: Metadata = {
  title: '聚星数据平台-小羊羔开发版权',
  description: '企业级客户关系管理系统，提供客户管理、线索跟踪、销售分析等完整解决方案',
  keywords: ['CRM', '客户管理', '销售管理', '企业管理', '数据分析'],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      {/*
        缓存控制 meta 标签：
        - 防止微信/企业微信等内置浏览器忽略 HTTP 头，强制缓存旧版 HTML
          导致引用的静态资源（CSS/JS）404 而页面变"裸"
        - 静态资源（/_next/static/*）由 nginx 单独 location 处理，HTTP 头已设置
          public, max-age=31536000, immutable，不会受这些 meta 影响
      */}
      <head>
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Expires" content="0" />
      </head>
      <body className={`antialiased`} suppressHydrationWarning>
        <ToastContextProvider>
          {isDev && <Inspector />}
          {children}
        </ToastContextProvider>
      </body>
    </html>
  );
}
