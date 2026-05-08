import { toast } from 'sonner';
import { getPendingActions, clearAction } from './action-queue';

let isProcessing = false;

export function initSyncManager() {
  if (typeof window === 'undefined') {
    return;
  }

  window.addEventListener('online', () => {
    toast.info('Đã kết nối mạng. Đang đồng bộ dữ liệu...');
    void processQueue();
  });

  window.addEventListener('offline', () => {
    toast.warning('Mất kết nối mạng. Các thao tác sẽ được lưu và đồng bộ khi có mạng.');
  });
}

export async function processQueue() {
  if (isProcessing || typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  isProcessing = true;

  try {
    const actions = await getPendingActions();

    if (actions.length === 0) {
      return;
    }

    let processed = 0;
    let failed = 0;

    for (const action of actions) {
      try {
        const response = await fetch('/api/v1/process-pending-action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': action.idempotencyKey
          },
          body: JSON.stringify(action)
        });

        if (response.ok) {
          await clearAction(action.idempotencyKey);
          processed++;
        } else if (response.status === 409) {
          // Already processed
          await clearAction(action.idempotencyKey);
          processed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    if (processed > 0) {
      toast.success(`Đã đồng bộ ${processed} thao tác.`);
    }

    if (failed > 0) {
      toast.error(`${failed} thao tác không thể đồng bộ. Sẽ thử lại sau.`);
    }
  } finally {
    isProcessing = false;
  }
}

export function registerBackgroundSync() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  void navigator.serviceWorker.ready.then((registration) => {
    if ('sync' in registration) {
      void registration.sync.register('gatesync-pending-actions');
    }
  });
}
