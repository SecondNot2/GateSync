import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveServerApiSession } from '@/lib/api/server-session';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import type { ApiIntegrationSyncRunsPage } from '@/lib/api/types';
import { SyncRunsClient } from './sync-runs-client';

/**
 * Admin page: lịch sử các lần chạy đồng bộ tích hợp (AUTO SYNC).
 *
 * Calls `GET /api/v1/integration-sync-runs` with cursor-based pagination,
 * provider/status filters, and renders only masked error messages
 * (`errorMessage` is already scrubbed by the backend).
 *
 * Validates: Requirements 4.1, 4.2, 4.7.
 */
export default async function SyncRunsPage() {
  const initialState = await resolveInitialLoad<ApiIntegrationSyncRunsPage>(async () => {
    const session = await resolveServerApiSession();

    if (session.mode === 'dev') {
      return { data: [], nextCursor: null };
    }

    return gatesyncApi.listIntegrationSyncRuns({ limit: 50 }, { accessToken: session.accessToken });
  });

  return <SyncRunsClient {...initialState} />;
}
