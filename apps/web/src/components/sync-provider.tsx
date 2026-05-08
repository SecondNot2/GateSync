'use client';

import { useEffect } from 'react';
import { initSyncManager } from '@/lib/offline/sync-manager';

export function SyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initSyncManager();
  }, []);

  return <>{children}</>;
}
