import { Suspense } from 'react';
import { TripsClient } from './trips-client';

export default function TripsPage() {
  return (
    <Suspense fallback={null}>
      <TripsClient />
    </Suspense>
  );
}
