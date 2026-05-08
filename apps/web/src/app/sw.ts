import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[];
  }
}

declare const self: WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    ...defaultCache,
    // Trip data: NetworkFirst with 5min network timeout
    {
      matcher: ({ url }: { url: URL }) =>
        url.pathname.startsWith('/api/v1/organizations') && url.pathname.includes('/trips'),
      handler: new NetworkFirst({
        cacheName: 'trips-data',
        networkTimeoutSeconds: 5
      })
    },
    // Dashboard stats: StaleWhileRevalidate
    {
      matcher: ({ url }: { url: URL }) => url.pathname.includes('/dashboard'),
      handler: new StaleWhileRevalidate({
        cacheName: 'dashboard-stats'
      })
    },
    // Media/images: CacheFirst
    {
      matcher: ({ request }: { request: Request }) => request.destination === 'image',
      handler: new CacheFirst({
        cacheName: 'media-images'
      })
    },
    // Notifications: NetworkFirst
    {
      matcher: ({ url }: { url: URL }) => url.pathname.startsWith('/api/v1/notifications'),
      handler: new NetworkFirst({
        cacheName: 'notifications',
        networkTimeoutSeconds: 3
      })
    }
  ]
});

serwist.addEventListeners();
