'use client';

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  NOTIFICATION_EVENT_TYPES,
  type NotificationChannel,
  type NotificationEventType
} from '@gatesync/shared';
import { AppShell } from '@/components/app-shell';
import { NoOrganizationState } from '@/components/no-organization-state';
import { Button, Panel, StatePanel } from '@/components/ui';
import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveWebApiSession } from '@/lib/api/session';
import { upsertMyNotificationPreferences } from '@/lib/operations/data';
import type { OrganizationAccessIssue } from '@/lib/operations/errors';
import { toOrganizationContext } from '@/lib/operations/view-model';
import type {
  ApiCurrentUser,
  ApiNotificationPreference,
  ApiNotificationRule,
  ApiOrganization
} from '@/lib/api/types';
import {
  PREFERENCE_CHANNEL_ORDER,
  preferenceChannelLabels,
  preferenceChannelShortLabels,
  preferenceEventTypeDescriptions,
  preferenceEventTypeLabels
} from './labels';

type InitialData = {
  organization: ApiOrganization;
  currentUser: ApiCurrentUser;
  preferences: ApiNotificationPreference[];
  rules: ApiNotificationRule[];
};

type NotificationPreferencesClientProps = {
  initialData?: InitialData;
  initialError?: string;
  initialOrganizationIssue?: OrganizationAccessIssue;
};

const PREFERENCES_QUERY_KEY = ['me', 'notification-preferences'] as const;

/**
 * Outer wrapper that owns a dedicated `QueryClient` for this page.
 *
 * Mirrors the `SyncRunsClient` pattern: the web app does not yet provide a
 * global `QueryClientProvider`, so each TanStack Query feature scopes its
 * own client. SSR-resolved data is hydrated into the cache so the first
 * paint matches the server output.
 */
export function NotificationPreferencesClient(props: NotificationPreferencesClientProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // User preferences change rarely; keep cache warm for 5 minutes
            // and avoid refetching on focus to prevent surprising form
            // state resets while the user is editing.
            staleTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationPreferencesContent {...props} />
    </QueryClientProvider>
  );
}

function NotificationPreferencesContent({
  initialData,
  initialError,
  initialOrganizationIssue
}: NotificationPreferencesClientProps) {
  const queryClient = useQueryClient();
  const organization = initialData?.organization;
  const currentUser = initialData?.currentUser;

  const queryKey = useMemo(
    () => [...PREFERENCES_QUERY_KEY, organization?.id ?? 'no-org'] as const,
    [organization?.id]
  );

  const query = useQuery<InitialData, Error>({
    queryKey,
    queryFn: async () => {
      if (!organization || !currentUser) {
        throw new Error('Tổ chức chưa sẵn sàng.');
      }
      const session = await resolveWebApiSession();
      if (session.mode === 'dev') {
        throw new Error(
          'Chế độ dữ liệu mẫu chưa hỗ trợ tùy chọn thông báo. Hãy cấu hình Supabase/API.'
        );
      }
      const [preferences, rules] = await Promise.all([
        gatesyncApi.listMyNotificationPreferences(organization.id, {
          accessToken: session.accessToken
        }),
        // Rules are admin-only; if the call fails (403) we degrade to "no
        // mandatory metadata" rather than blocking the form.
        gatesyncApi
          .listNotificationRules(organization.id, { accessToken: session.accessToken })
          .catch((rulesError: unknown) => {
            if (
              rulesError &&
              typeof rulesError === 'object' &&
              'status' in rulesError &&
              (rulesError as { status?: number }).status === 403
            ) {
              return [] as ApiNotificationRule[];
            }
            throw rulesError;
          })
      ]);

      return {
        organization,
        currentUser,
        preferences,
        rules
      } satisfies InitialData;
    },
    enabled: Boolean(organization && currentUser),
    ...(initialData ? { initialData } : {})
  });

  const data: InitialData | undefined = query.data ?? initialData;

  if (initialOrganizationIssue && initialError) {
    return (
      <AppShell
        activeNav="settings"
        eyebrow="Tài khoản của tôi"
        title="Tùy chọn thông báo"
        description="Bật/tắt nhận thông báo theo loại sự kiện và kênh phân phối. Tùy chọn này chỉ áp dụng cho tài khoản của bạn."
      >
        <NoOrganizationState issue={initialOrganizationIssue} message={initialError} />
      </AppShell>
    );
  }

  const errorMessage = query.error?.message || initialError;

  if (!data) {
    return (
      <AppShell
        activeNav="settings"
        eyebrow="Tài khoản của tôi"
        title="Tùy chọn thông báo"
        description="Bật/tắt nhận thông báo theo loại sự kiện và kênh phân phối. Tùy chọn này chỉ áp dụng cho tài khoản của bạn."
      >
        {errorMessage ? (
          <StatePanel tone="error" message={errorMessage} />
        ) : (
          <StatePanel tone="loading" message="Đang tải tùy chọn thông báo..." />
        )}
      </AppShell>
    );
  }

  const shellOrganization = toOrganizationContext(data.organization, data.currentUser);

  return (
    <AppShell
      activeNav="settings"
      eyebrow="Tài khoản của tôi"
      title="Tùy chọn thông báo"
      description="Bật/tắt nhận thông báo theo loại sự kiện và kênh phân phối. Tùy chọn này chỉ áp dụng cho tài khoản của bạn."
      organization={shellOrganization}
    >
      {errorMessage ? <StatePanel className="mb-4" tone="error" message={errorMessage} /> : null}

      <PreferencesMatrix
        organization={data.organization}
        currentUser={data.currentUser}
        preferences={data.preferences}
        rules={data.rules}
        onSaved={async (updated) => {
          // Update cache with the freshly returned rows so the form
          // immediately reflects the server-authoritative state.
          queryClient.setQueryData<InitialData>(queryKey, (current) =>
            current ? { ...current, preferences: updated } : current
          );
          await queryClient.invalidateQueries({ queryKey: PREFERENCES_QUERY_KEY });
        }}
      />
    </AppShell>
  );
}

type PreferencesMatrixProps = {
  organization: ApiOrganization;
  currentUser: ApiCurrentUser;
  preferences: ApiNotificationPreference[];
  rules: ApiNotificationRule[];
  onSaved: (updated: ApiNotificationPreference[]) => Promise<void>;
};

type FormValues = {
  cells: Record<string, boolean>;
};

/**
 * The presentational matrix: one row per `eventType`, one column per
 * channel. Each cell is an independent toggle.
 *
 * Form state is keyed by `${eventType}::${channel}` to keep React Hook
 * Form's `Controller` happy with stable string keys (object keys with
 * colons are valid but easier to debug than nested registers).
 *
 * Mandatory rules (`rule.mandatory = true` in the org's rule set) flag the
 * matching `(eventType, channel)` cell as locked: the toggle stays
 * disabled and pinned to `true` so the orchestrator's mandatory bypass
 * (Requirement 10.3) is reflected truthfully in the UI.
 */
function PreferencesMatrix({
  organization,
  currentUser,
  preferences,
  rules,
  onSaved
}: PreferencesMatrixProps) {
  const channels = PREFERENCE_CHANNEL_ORDER;

  // The `sync_run_failed` event is admin-only and synthesised by the
  // orchestrator from a mandatory rule, not a user-configurable preference.
  // Hide it from end-users to avoid suggesting it can be toggled, but keep
  // it visible to admins (who at least see why their inbox fills with sync
  // failures). The check uses the membership role exposed by the active
  // organization context.
  const isAdmin =
    organization.currentUserMembership.role === 'OWNER' ||
    organization.currentUserMembership.role === 'ADMIN';
  const eventTypes = useMemo<NotificationEventType[]>(
    () =>
      NOTIFICATION_EVENT_TYPES.filter((eventType) =>
        eventType === 'sync_run_failed' ? isAdmin : true
      ),
    [isAdmin]
  );

  const mandatoryCells = useMemo(() => buildMandatoryCellSet(rules), [rules]);
  const defaults = useMemo(
    () => buildDefaultValues(preferences, eventTypes, channels, mandatoryCells),
    [channels, eventTypes, mandatoryCells, preferences]
  );

  const { control, handleSubmit, reset, watch, formState } = useForm<FormValues>({
    defaultValues: defaults
  });

  // When SSR data is replaced by a fresh fetch the defaults change, so
  // re-seed the form to keep server and client in sync without losing the
  // user's actively-edited intentions (RHF preserves dirty fields by
  // default when we pass `keepDirtyValues`).
  useEffect(() => {
    reset(defaults, { keepDirtyValues: true });
  }, [defaults, reset]);

  const [feedback, setFeedback] = useState<{
    tone: 'info' | 'error';
    message: string;
  }>();

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const items = serializePreferences(values, eventTypes, channels, mandatoryCells);
      return upsertMyNotificationPreferences({
        organizationId: organization.id,
        userId: currentUser.id,
        preferences: items
      });
    },
    onSuccess: async (updated) => {
      setFeedback({ tone: 'info', message: 'Đã lưu tùy chọn thông báo.' });
      await onSaved(updated);
    },
    onError: (error: unknown) => {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Không thể lưu tùy chọn thông báo. Vui lòng thử lại.'
      });
    }
  });

  const watchedCells = watch('cells');

  return (
    <Panel>
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Tổ chức</p>
        <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">{organization.name}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Bạn có thể tắt thông báo cho từng cặp loại sự kiện × kênh. Các quy tắc bắt buộc của tổ
          chức sẽ luôn được gửi và không thể tắt từ đây.
        </p>
      </header>

      {rules.length === 0 ? (
        <StatePanel
          className="mt-4"
          tone="info"
          message="Chưa có thông tin quy tắc bắt buộc của tổ chức. Nếu bạn không phải quản trị viên, các kênh bắt buộc sẽ vẫn được gửi theo cấu hình của tổ chức."
        />
      ) : null}

      {feedback ? (
        <StatePanel className="mt-4" tone={feedback.tone} message={feedback.message} />
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFeedback(undefined);
          void handleSubmit((values) => mutation.mutateAsync(values))(event);
        }}
        className="mt-6"
        noValidate
      >
        {/* Desktop: dense table */}
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
          <table className="min-w-full divide-y divide-slate-200 bg-white text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
                >
                  Loại sự kiện
                </th>
                {channels.map((channel) => (
                  <th
                    key={channel}
                    scope="col"
                    className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
                  >
                    {preferenceChannelLabels[channel]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eventTypes.map((eventType) => (
                <tr key={eventType} className="align-top">
                  <th scope="row" className="sticky left-0 bg-white px-4 py-3 text-left align-top">
                    <p className="text-sm font-semibold text-slate-900">
                      {preferenceEventTypeLabels[eventType]}
                    </p>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                      {preferenceEventTypeDescriptions[eventType]}
                    </p>
                  </th>
                  {channels.map((channel) => {
                    const cellKey = toCellKey(eventType, channel);
                    const isLocked = mandatoryCells.has(cellKey);
                    return (
                      <td key={channel} className="px-4 py-3 text-center">
                        <Controller
                          control={control}
                          name={`cells.${cellKey}` as const}
                          render={({ field }) => (
                            <ToggleCell
                              checked={isLocked ? true : Boolean(field.value)}
                              locked={isLocked}
                              onChange={(next) => {
                                if (isLocked) return;
                                field.onChange(next);
                              }}
                              ariaLabel={`${preferenceEventTypeLabels[eventType]} – ${preferenceChannelLabels[channel]}`}
                            />
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: stacked cards */}
        <div className="space-y-3 lg:hidden">
          {eventTypes.map((eventType) => (
            <div key={eventType} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {preferenceEventTypeLabels[eventType]}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {preferenceEventTypeDescriptions[eventType]}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {channels.map((channel) => {
                  const cellKey = toCellKey(eventType, channel);
                  const isLocked = mandatoryCells.has(cellKey);
                  return (
                    <Controller
                      key={channel}
                      control={control}
                      name={`cells.${cellKey}` as const}
                      render={({ field }) => (
                        <label
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border bg-white px-3 py-2 text-sm transition ${
                            isLocked
                              ? 'border-amber-200 bg-amber-50'
                              : field.value
                                ? 'border-sky-300'
                                : 'border-slate-200'
                          } ${isLocked ? 'cursor-not-allowed' : ''}`}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900">
                              {preferenceChannelShortLabels[channel]}
                            </span>
                            {isLocked ? (
                              <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-700">
                                Bắt buộc
                              </span>
                            ) : null}
                          </span>
                          <ToggleCell
                            checked={isLocked ? true : Boolean(field.value)}
                            locked={isLocked}
                            onChange={(next) => {
                              if (isLocked) return;
                              field.onChange(next);
                            }}
                            ariaLabel={`${preferenceEventTypeLabels[eventType]} – ${preferenceChannelLabels[channel]}`}
                          />
                        </label>
                      )}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={mutation.isPending || !formState.isDirty}
          >
            {mutation.isPending ? 'Đang lưu...' : 'Lưu tùy chọn'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.isPending || !formState.isDirty}
            onClick={() => {
              reset(defaults);
              setFeedback(undefined);
            }}
          >
            Hoàn tác thay đổi
          </Button>
          <span className="text-xs text-slate-400">
            {countEnabled(watchedCells, mandatoryCells)} / {eventTypes.length * channels.length}{' '}
            kênh đang bật.
          </span>
        </div>
      </form>
    </Panel>
  );
}

function ToggleCell({
  checked,
  locked,
  onChange,
  ariaLabel
}: {
  checked: boolean;
  locked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={locked}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-6 w-11 items-center rounded-full border transition ${
        locked
          ? 'cursor-not-allowed border-amber-200 bg-amber-100'
          : checked
            ? 'border-sky-400 bg-sky-500'
            : 'border-slate-200 bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
      <span className="sr-only">{checked ? 'đang bật' : 'đang tắt'}</span>
    </button>
  );
}

function toCellKey(eventType: NotificationEventType, channel: NotificationChannel): string {
  return `${eventType}::${channel}`;
}

function buildMandatoryCellSet(rules: ApiNotificationRule[]): Set<string> {
  const cells = new Set<string>();
  for (const rule of rules) {
    if (!rule.mandatory || !rule.enabled || rule.deletedAt) {
      continue;
    }
    const eventType = rule.eventType as NotificationEventType;
    for (const channel of rule.channels) {
      cells.add(toCellKey(eventType, channel));
    }
  }
  return cells;
}

function buildDefaultValues(
  preferences: ApiNotificationPreference[],
  eventTypes: readonly NotificationEventType[],
  channels: readonly NotificationChannel[],
  mandatoryCells: Set<string>
): FormValues {
  // Index existing preferences for O(1) lookup. Preferences default to
  // `enabled = true` (Requirement 10.2) when no row exists, matching the
  // server-side `PreferenceFilter` default.
  const index = new Map<string, boolean>();
  for (const row of preferences) {
    index.set(toCellKey(row.eventType as NotificationEventType, row.channel), row.enabled);
  }

  const cells: Record<string, boolean> = {};
  for (const eventType of eventTypes) {
    for (const channel of channels) {
      const key = toCellKey(eventType, channel);
      if (mandatoryCells.has(key)) {
        cells[key] = true;
        continue;
      }
      cells[key] = index.get(key) ?? true;
    }
  }
  return { cells };
}

function serializePreferences(
  values: FormValues,
  eventTypes: readonly NotificationEventType[],
  channels: readonly NotificationChannel[],
  mandatoryCells: Set<string>
): Array<{ eventType: NotificationEventType; channel: NotificationChannel; enabled: boolean }> {
  const items: Array<{
    eventType: NotificationEventType;
    channel: NotificationChannel;
    enabled: boolean;
  }> = [];
  for (const eventType of eventTypes) {
    for (const channel of channels) {
      const key = toCellKey(eventType, channel);
      // Skip mandatory cells: the server enforces the bypass in the
      // orchestrator (Requirement 10.3), and persisting `enabled = true`
      // for mandatory rows is informational at best. Sending fewer rows
      // also keeps the request payload small.
      if (mandatoryCells.has(key)) {
        continue;
      }
      const enabled = Boolean(values.cells[key]);
      items.push({ eventType, channel, enabled });
    }
  }
  return items;
}

function countEnabled(cells: FormValues['cells'] | undefined, mandatoryCells: Set<string>): number {
  if (!cells) return 0;
  let total = 0;
  for (const [key, value] of Object.entries(cells)) {
    if (mandatoryCells.has(key) || value) {
      total += 1;
    }
  }
  return total;
}
