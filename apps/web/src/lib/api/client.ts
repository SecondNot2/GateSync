import type { ApiEnvelope, ApiErrorEnvelope, ApiSuccessEnvelope } from '@gatesync/shared';
import { webEnv } from '@/lib/env';

type RequestOptions = {
  accessToken?: string;
  headers?: HeadersInit;
};

export class ApiClientError extends Error {
  code: string;
  details?: unknown;
  status?: number;

  constructor(error: ApiErrorEnvelope['error'], status?: number) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.details = error.details;

    if (status !== undefined) {
      this.status = status;
    }
  }
}

export class ConflictError extends ApiClientError {
  constructor(error: ApiErrorEnvelope['error']) {
    super(error, 409);
    this.name = 'ConflictError';
  }
}

async function request<TData>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<TData> {
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.accessToken) {
    headers.set('Authorization', `Bearer ${options.accessToken}`);
  }

  const response = await fetch(`${webEnv.apiBaseUrl}${path}`, {
    ...init,
    headers
  });

  const envelope = (await response.json()) as ApiEnvelope<TData>;

  if ('error' in envelope) {
    if (response.status === 409) {
      throw new ConflictError(envelope.error);
    }

    throw new ApiClientError(envelope.error, response.status);
  }

  if (!response.ok) {
    throw new ApiClientError(
      {
        code: response.statusText || 'HTTP_ERROR',
        message: 'Không thể kết nối API GateSync.'
      },
      response.status
    );
  }

  return (envelope as ApiSuccessEnvelope<TData>).data;
}

export const apiClient = {
  get: <TData>(path: string, options?: RequestOptions) =>
    request<TData>(path, { method: 'GET' }, options),
  post: <TData>(path: string, body: unknown, options?: RequestOptions) =>
    request<TData>(path, { method: 'POST', body: JSON.stringify(body) }, options),
  patch: <TData>(path: string, body: unknown, options?: RequestOptions) =>
    request<TData>(path, { method: 'PATCH', body: JSON.stringify(body) }, options),
  delete: <TData>(path: string, options?: RequestOptions) =>
    request<TData>(path, { method: 'DELETE' }, options)
};
