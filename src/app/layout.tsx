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
      <body className={`antialiased`} suppressHydrationWarning>
        <ToastContextProvider>
          {isDev && <Inspector />}
          {children}
        </ToastContextProvider>
      </body>
    </html>
  );
}
