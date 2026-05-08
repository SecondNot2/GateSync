import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { SyncProvider } from '@/components/sync-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'GateSync',
  description: 'Tháp điều phối logistics cửa khẩu cho vận hành doanh nghiệp',
  manifest: '/manifest.json',
  icons: {
    icon: '/gs-logo.png',
    shortcut: '/gs-logo.png',
    apple: '/gs-logo.png'
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'GateSync'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SyncProvider>
          {children}
        </SyncProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
