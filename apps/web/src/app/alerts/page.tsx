import { resolveServerApiSession } from '@/lib/api/server-session';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import { loadDashboardDataForSession } from '@/lib/operations/data';
import { AlertsClient } from './alerts-client';

export default async function AlertsPage() {
  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();
    return loadDashboardDataForSession(session);
  });

  return <AlertsClient {...initialState} />;
}
