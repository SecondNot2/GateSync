import { resolveServerApiSession } from '@/lib/api/server-session';
import { loadDashboardDataForSession } from '@/lib/operations/data';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();

    return loadDashboardDataForSession(session);
  });

  return <DashboardClient {...initialState} />;
}
