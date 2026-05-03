import type { ApiEnvelope } from '@gatesync/shared';
import { webEnv } from '@/lib/env';

type RequestOptions = {
  accessToken?: string;
  headers?: HeadersInit;
};

async function request<TData>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<ApiEnvelope<TData>> {
  const headers = new Headers(options.headers);

  headers.set('Content-Type', 'application/json');

  if (options.accessToken) {
    headers.set('Authorization', `Bearer ${options.accessToken}`);
  }

  const response = await fetch(`${webEnv.apiBaseUrl}${path}`, {
    ...init,
    headers
  });

  return response.json() as Promise<ApiEnvelope<TData>>;
}

export const apiClient = {
  get: <TData>(path: string, options?: RequestOptions) => request<TData>(path, { method: 'GET' }, options),
  post: <TData>(path: string, body: unknown, options?: RequestOptions) =>
    request<TData>(path, { method: 'POST', body: JSON.stringify(body) }, options),
  patch: <TData>(path: string, body: unknown, options?: RequestOptions) =>
    request<TData>(path, { method: 'PATCH', body: JSON.stringify(body) }, options),
  delete: <TData>(path: string, options?: RequestOptions) =>
    request<TData>(path, { method: 'DELETE' }, options)
};
