import { getOfflineDB } from './db';

export async function cacheTrips(trips: Array<{ id: string }>) {
  const db = await getOfflineDB();
  const tx = db.transaction('trips', 'readwrite');
  const store = tx.objectStore('trips');

  await Promise.all(
    trips.map((trip) =>
      store.put({
        id: trip.id,
        data: trip,
        cachedAt: Date.now()
      })
    )
  );

  await tx.done;
}

export async function getCachedTrips(): Promise<Array<{ id: string }>> {
  const db = await getOfflineDB();
  const entries = await db.getAll('trips');

  return entries
    .filter((entry) => Date.now() - entry.cachedAt < 5 * 60 * 1000) // 5 min TTL
    .map((entry) => entry.data as { id: string });
}

export async function cacheTripDetail(tripId: string, trip: unknown) {
  const db = await getOfflineDB();
  await db.put('trips', {
    id: tripId,
    data: trip,
    cachedAt: Date.now()
  });
}

export async function getCachedTripDetail(tripId: string): Promise<unknown | null> {
  const db = await getOfflineDB();
  const entry = await db.get('trips', tripId);

  if (!entry || Date.now() - entry.cachedAt > 5 * 60 * 1000) {
    return null;
  }

  return entry.data;
}

export async function clearTripCache() {
  const db = await getOfflineDB();
  await db.clear('trips');
}
