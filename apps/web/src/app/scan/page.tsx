import { resolveServerApiSession } from '@/lib/api/server-session';
import { loadDashboardDataForSession } from '@/lib/operations/data';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import { ScanClient } from './scan-client';

export default async function ScanPage() {
  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();
    return loadDashboardDataForSession(session);
  });

  return <ScanClient {...initialState} />;
}
