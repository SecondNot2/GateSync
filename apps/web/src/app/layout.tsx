import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GateSync',
  description: 'Tháp điều phối logistics cửa khẩu cho vận hành doanh nghiệp',
  icons: {
    icon: '/gs-logo.png',
    shortcut: '/gs-logo.png',
    apple: '/gs-logo.png'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
