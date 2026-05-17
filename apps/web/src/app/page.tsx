import { redirect } from 'next/navigation';
import { loginPath } from '@/lib/auth/paths';

export default function RootPage() {
  redirect(loginPath);
}
