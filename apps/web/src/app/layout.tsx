import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GateSync',
  description: 'Border logistics control tower for enterprise operations',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/apple-touch-icon.png'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
