import type { OrganizationAccessIssue } from '@/lib/operations/errors';
import { isOrganizationAccessError } from '@/lib/operations/errors';
import { webEnv } from '@/lib/env';

export type InitialLoadState<TData> = {
  initialData?: TData;
  initialError?: string;
  initialOrganizationIssue?: OrganizationAccessIssue;
};

const isApiReachableFromServer =
  !webEnv.apiBaseUrl.includes('localhost') || process.env.NODE_ENV === 'development';

export async function resolveInitialLoad<TData>(loader: () => Promise<TData>): Promise<InitialLoadState<TData>> {
  if (!isApiReachableFromServer) {
    return {};
  }

  try {
    return {
      initialData: await loader()
    };
  } catch (error) {
    const initialState: InitialLoadState<TData> = {
      initialError: error instanceof Error ? error.message : 'Không thể tải dữ liệu GateSync.'
    };

    if (isOrganizationAccessError(error)) {
      initialState.initialOrganizationIssue = error.issue;
    }

    return initialState;
  }
}
