import { resolveServerApiSession } from '@/lib/api/server-session';
import { loadTripsDataForSession } from '@/lib/operations/data';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import {
  toTripFilters,
  toUrlSearchParams,
  type TripsSearchParams
} from '@/lib/operations/trip-filters';
import { TripsClient } from './trips-client';

type TripsPageProps = {
  searchParams?: Promise<TripsSearchParams>;
};

export default async function TripsPage({ searchParams }: TripsPageProps) {
  const urlSearchParams = toUrlSearchParams(await searchParams);
  const filters = toTripFilters(urlSearchParams);
  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();

    return loadTripsDataForSession(session, filters);
  });

  return <TripsClient {...initialState} initialSearchKey={urlSearchParams.toString()} />;
}
