import { resolveServerApiSession } from '@/lib/api/server-session';
import { loadAdminDataForSession } from '@/lib/operations/data';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import { AdminClient } from './admin-client';

export default async function AdminPage() {
  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();

    return loadAdminDataForSession(session);
  });

  return <AdminClient {...initialState} />;
}
