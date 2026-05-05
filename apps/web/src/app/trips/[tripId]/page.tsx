import { resolveServerApiSession } from '@/lib/api/server-session';
import { loadTripDetailDataForSession } from '@/lib/operations/data';
import { resolveInitialLoad } from '@/lib/operations/initial-load';
import { TripDetailClient } from './trip-detail-client';

type TripDetailPageProps = {
  params: Promise<{
    tripId: string;
  }>;
};

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const { tripId } = await params;
  const initialState = await resolveInitialLoad(async () => {
    const session = await resolveServerApiSession();

    return loadTripDetailDataForSession(session, tripId);
  });

  return <TripDetailClient tripId={tripId} {...initialState} />;
}
