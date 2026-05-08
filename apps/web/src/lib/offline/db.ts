import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'gatesync-offline';
const DB_VERSION = 1;

type OfflineDB = {
  trips: {
    key: string;
    value: {
      id: string;
      data: unknown;
      cachedAt: number;
    };
  };
  notifications: {
    key: string;
    value: {
      id: string;
      data: unknown;
      cachedAt: number;
    };
  };
  pendingActions: {
    key: string;
    value: {
      idempotencyKey: string;
      action: string;
      tripId: string;
      payload: unknown;
      createdAt: number;
    };
  };
};

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

export function getOfflineDB() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('trips')) {
          db.createObjectStore('trips', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('notifications')) {
          db.createObjectStore('notifications', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pendingActions')) {
          db.createObjectStore('pendingActions', { keyPath: 'idempotencyKey' });
        }
      }
    });
  }

  return dbPromise;
}

export async function isOffline(): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return !navigator.onLine;
}
