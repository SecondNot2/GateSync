import { getOfflineDB } from './db';

export type PendingAction = {
  idempotencyKey: string;
  action: 'CREATE_TRIP_EVENT' | 'UPLOAD_MEDIA' | 'CHECK_IN';
  tripId: string;
  payload: unknown;
  createdAt: number;
};

export async function queueAction(action: PendingAction) {
  const db = await getOfflineDB();
  await db.put('pendingActions', action);
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const db = await getOfflineDB();
  return db.getAll('pendingActions') as Promise<PendingAction[]>;
}

export async function clearAction(idempotencyKey: string) {
  const db = await getOfflineDB();
  await db.delete('pendingActions', idempotencyKey);
}

export async function clearAllActions() {
  const db = await getOfflineDB();
  await db.clear('pendingActions');
}

export async function processPendingActions(
  processor: (action: PendingAction) => Promise<boolean>
): Promise<{ processed: number; failed: number }> {
  const actions = await getPendingActions();
  let processed = 0;
  let failed = 0;

  for (const action of actions) {
    try {
      const success = await processor(action);

      if (success) {
        await clearAction(action.idempotencyKey);
        processed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}
