'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_RULE_CHANNELS,
  notificationRuleSchema,
  type NotificationEventType,
  type NotificationRuleChannel,
  type NotificationRuleInput,
  type NotificationRuleRecipientScope
} from '@gatesync/shared';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, type SubmitHandler } from 'react-hook-form';
import { Button, SelectInput, StatePanel, TextInput } from '@/components/ui';
import {
  notificationChannelLabels,
  notificationEventTypeLabels,
  notificationRecipientScopeOptions
} from './labels';

/**
 * Default values applied when the editor is opened in "create" mode.
 *
 * The shared schema defaults `customUserIds`, `mandatory`, and `enabled`,
 * but React Hook Form needs concrete values for controlled inputs to render
 * a stable initial state — so we mirror the schema defaults here.
 */
const createDefaults: NotificationRuleInput = {
  name: '',
  eventType: 'trip_status_changed',
  channels: ['IN_APP'],
  recipientScope: 'organization_admins',
  customUserIds: [],
  mandatory: false,
  enabled: true
};

export type RuleFormValues = NotificationRuleInput;

export type RuleFormProps = {
  /** When provided, the editor renders in "edit" mode. */
  initialValues?: Partial<NotificationRuleInput>;
  /** Disable all inputs (e.g. user does not have admin permission). */
  disabled?: boolean;
  /** Submit handler invoked with the validated, defaults-applied payload. */
  onSubmit: (values: NotificationRuleInput) => Promise<void>;
  /** Optional cancel callback rendered as a secondary action. */
  onCancel?: () => void;
  /** Submit button copy. Defaults to a sensible Vietnamese label. */
  submitLabel?: string;
  /** Server-side error surfaced above the submit button. */
  serverError?: string | undefined;
  /**
   * Active organization members shown in the `custom_user_list` picker.
   *
   * The editor pages fetch the roster from `GET /organizations/:id/memberships`
   * (via `loadAdminNotificationRuleUserOptions`) and pass the result here so
   * the form can render real names/emails instead of forcing admins to paste
   * raw UUIDs. When the prop is missing or empty (e.g. roster failed to
   * load) the form falls back to the legacy comma-separated UUID textarea.
   */
  userOptions?: Array<{ userId: string; label: string; role: string }>;
  /**
   * Notice rendered alongside the user picker when the roster could not be
   * loaded. Surfaces the underlying error without breaking the form.
   */
  userOptionsError?: string | undefined;
};

/**
 * Reusable form for `NotificationRule` create + edit pages.
 *
 * Validation is driven by the SHARED `notificationRuleSchema` from
 * `@gatesync/shared`, so the client enforces the exact same invariants the
 * server uses (Property 19 / Requirements 6.4, 6.5). The server remains the
 * authority — we just block obvious mistakes early so admins get instant
 * feedback.
 *
 * `customUserIds` is collected as a comma- or newline-separated list of UUIDs
 * since the design defers a real user picker to a future iteration. The raw
 * text is parsed to a UUID array on submit and validated by the schema.
 */
export function RuleForm({
  initialValues,
  disabled = false,
  onSubmit,
  onCancel,
  submitLabel,
  serverError,
  userOptions,
  userOptionsError
}: RuleFormProps) {
  const defaults = useMemo<NotificationRuleInput>(() => {
    return {
      ...createDefaults,
      ...initialValues,
      // Re-apply array defaults defensively: spreading from a partial may
      // leave `channels` or `customUserIds` undefined.
      channels: initialValues?.channels ?? createDefaults.channels,
      customUserIds: initialValues?.customUserIds ?? createDefaults.customUserIds
    };
  }, [initialValues]);

  const {
    control,
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<NotificationRuleInput>({
    // Cast guards against zod's `ZodEffects` wrapper — RHF infers from the
    // input type which is widened by the `.refine`. Behavior is unchanged.
    resolver: zodResolver(notificationRuleSchema as unknown as Parameters<typeof zodResolver>[0]),
    defaultValues: defaults
  });

  // Local mirror of the comma-separated UUID textarea so admins can type
  // freely without RHF re-rendering the field on every keystroke. Only used
  // when no `userOptions` roster is supplied (legacy fallback).
  const initialIds = defaults.customUserIds ?? [];
  const [customUserIdsInput, setCustomUserIdsInput] = useState<string>(initialIds.join('\n'));
  const [customUserIdsError, setCustomUserIdsError] = useState<string | undefined>();

  // Picker-mode state: a Set of selected userIds. Kept in sync with RHF via
  // `setValue` so the schema sees the picker output on submit.
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set(initialIds));
  const [pickerSearch, setPickerSearch] = useState<string>('');
  const usePicker = Array.isArray(userOptions) && userOptions.length > 0;

  // Reset when the loaded record changes (e.g. when navigating between rules
  // or when the initial fetch resolves after the form mounted).
  useEffect(() => {
    reset(defaults);
    const ids = defaults.customUserIds ?? [];
    setCustomUserIdsInput(ids.join('\n'));
    setCustomUserIdsError(undefined);
    setPickerSelection(new Set(ids));
    setPickerSearch('');
  }, [defaults, reset]);

  const recipientScope = watch('recipientScope');
  const showCustomUserIds = recipientScope === 'custom_user_list';

  const submit: SubmitHandler<NotificationRuleInput> = async (values) => {
    if (values.recipientScope === 'custom_user_list') {
      if (usePicker) {
        const selected = Array.from(pickerSelection);
        if (selected.length === 0) {
          setCustomUserIdsError(
            'Hãy chọn ít nhất một thành viên khi phạm vi là "Danh sách người dùng tùy chỉnh".'
          );
          return;
        }
        setCustomUserIdsError(undefined);
        await onSubmit({ ...values, customUserIds: selected });
        return;
      }

      const customUserIds = parseCustomUserIds(customUserIdsInput);
      if (customUserIds.invalid.length > 0) {
        setCustomUserIdsError(
          `Có ${customUserIds.invalid.length} giá trị không phải UUID hợp lệ. Hãy kiểm tra lại danh sách.`
        );
        return;
      }
      if (customUserIds.valid.length === 0) {
        setCustomUserIdsError(
          'Danh sách người dùng tùy chỉnh không được để trống khi phạm vi là "Danh sách người dùng tùy chỉnh".'
        );
        return;
      }
      setCustomUserIdsError(undefined);
      await onSubmit({ ...values, customUserIds: customUserIds.valid });
      return;
    }
    setCustomUserIdsError(undefined);
    await onSubmit({ ...values, customUserIds: [] });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(submit)(event);
      }}
      className="grid gap-4"
      noValidate
    >
      <fieldset disabled={disabled} className="grid gap-4">
        <TextInput
          label="Tên quy tắc"
          required
          placeholder="Ví dụ: Báo cho điều phối khi xe đến cửa khẩu"
          {...register('name')}
          aria-invalid={errors.name ? 'true' : undefined}
        />
        {errors.name?.message ? (
          <p className="-mt-3 text-xs font-semibold text-rose-600">{errors.name.message}</p>
        ) : null}

        <Controller
          control={control}
          name="eventType"
          render={({ field }) => (
            <SelectInput
              label="Loại sự kiện"
              value={field.value}
              onChange={(event) => field.onChange(event.target.value as NotificationEventType)}
              options={NOTIFICATION_EVENT_TYPES.map((eventType) => ({
                value: eventType,
                label: notificationEventTypeLabels[eventType]
              }))}
            />
          )}
        />

        <ChannelsField
          value={watch('channels') ?? []}
          onChange={(next) =>
            setValue('channels', next, { shouldDirty: true, shouldValidate: true })
          }
        />
        {errors.channels?.message ? (
          <p className="-mt-2 text-xs font-semibold text-rose-600">{errors.channels.message}</p>
        ) : null}

        <Controller
          control={control}
          name="recipientScope"
          render={({ field }) => (
            <SelectInput
              label="Phạm vi người nhận"
              value={field.value}
              onChange={(event) =>
                field.onChange(event.target.value as NotificationRuleRecipientScope)
              }
              options={notificationRecipientScopeOptions}
            />
          )}
        />

        {showCustomUserIds ? (
          usePicker ? (
            <UserPickerField
              users={userOptions ?? []}
              selected={pickerSelection}
              search={pickerSearch}
              onSearchChange={setPickerSearch}
              onToggle={(userId, checked) => {
                setPickerSelection((current) => {
                  const next = new Set(current);
                  if (checked) {
                    next.add(userId);
                  } else {
                    next.delete(userId);
                  }
                  setValue('customUserIds', Array.from(next), {
                    shouldDirty: true,
                    shouldValidate: true
                  });
                  if (customUserIdsError) {
                    setCustomUserIdsError(undefined);
                  }
                  return next;
                });
              }}
              error={customUserIdsError}
              loadError={userOptionsError}
            />
          ) : (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Danh sách userId tùy chỉnh
              </span>
              {userOptionsError ? (
                <span className="mt-2 block rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {userOptionsError} Bạn vẫn có thể nhập thủ công UUID nếu cần.
                </span>
              ) : null}
              <textarea
                value={customUserIdsInput}
                onChange={(event) => {
                  setCustomUserIdsInput(event.target.value);
                  if (customUserIdsError) {
                    setCustomUserIdsError(undefined);
                  }
                }}
                rows={4}
                placeholder="Mỗi dòng (hoặc dấu phẩy) một UUID — ví dụ: 11111111-2222-3333-4444-555555555555"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
              <span className="mt-2 block text-xs leading-5 text-slate-500">
                Nhập userId của thành viên thuộc tổ chức. Máy chủ sẽ kiểm tra lại tư cách thành viên
                trước khi lưu.
              </span>
              {customUserIdsError ? (
                <p className="mt-2 text-xs font-semibold text-rose-600">{customUserIdsError}</p>
              ) : null}
              {errors.customUserIds?.message ? (
                <p className="mt-2 text-xs font-semibold text-rose-600">
                  {errors.customUserIds.message}
                </p>
              ) : null}
            </label>
          )
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <CheckboxRow
            label="Quy tắc bắt buộc"
            hint="Bỏ qua tùy chọn của người dùng và luôn gửi thông báo cho mọi người nhận trong phạm vi."
            registerProps={register('mandatory')}
          />
          <CheckboxRow
            label="Bật quy tắc"
            hint="Tắt sẽ tạm dừng phân phối thông báo cho quy tắc này nhưng giữ nguyên cấu hình."
            registerProps={register('enabled')}
          />
        </div>
      </fieldset>

      {serverError ? <StatePanel tone="error" message={serverError} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={disabled || isSubmitting} variant="primary">
          {submitLabel ?? (isSubmitting ? 'Đang lưu...' : 'Lưu quy tắc')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Hủy
          </Button>
        ) : null}
        {!isDirty && !isSubmitting ? (
          <span className="text-xs text-slate-400">Chưa có thay đổi nào để lưu.</span>
        ) : null}
      </div>
    </form>
  );
}

function ChannelsField({
  value,
  onChange
}: {
  value: NotificationRuleChannel[];
  onChange: (next: NotificationRuleChannel[]) => void;
}) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Kênh phân phối
      </span>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {NOTIFICATION_RULE_CHANNELS.map((channel) => {
          const checked = value.includes(channel);
          return (
            <label
              key={channel}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                checked
                  ? 'border-sky-300 bg-sky-50 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...value, channel]);
                  } else {
                    onChange(value.filter((entry) => entry !== channel));
                  }
                }}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
              />
              <span>
                <span className="block font-semibold">{notificationChannelLabels[channel]}</span>
                <span className="text-xs text-slate-500">{channel}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Phải chọn ít nhất một kênh để bộ điều phối có thể tạo ra một bản ghi gửi thông báo.
      </p>
    </div>
  );
}

function CheckboxRow({
  label,
  hint,
  registerProps
}: {
  label: string;
  hint: string;
  registerProps: ReturnType<ReturnType<typeof useForm<NotificationRuleInput>>['register']>;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
      <input
        type="checkbox"
        {...registerProps}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="text-xs leading-5 text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

function UserPickerField({
  users,
  selected,
  search,
  onSearchChange,
  onToggle,
  error,
  loadError
}: {
  users: Array<{ userId: string; label: string; role: string }>;
  selected: Set<string>;
  search: string;
  onSearchChange: (value: string) => void;
  onToggle: (userId: string, checked: boolean) => void;
  error?: string | undefined;
  loadError?: string | undefined;
}) {
  const normalized = search.trim().toLowerCase();
  const filtered =
    normalized.length === 0
      ? users
      : users.filter(
          (user) =>
            user.label.toLowerCase().includes(normalized) ||
            user.userId.toLowerCase().includes(normalized)
        );

  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Danh sách người dùng tùy chỉnh
      </span>
      <p className="mt-1 text-xs text-slate-500">
        Chọn các thành viên đang hoạt động trong tổ chức. Đã chọn{' '}
        <span className="font-semibold text-slate-700">{selected.size}</span> / {users.length} thành
        viên.
      </p>
      {loadError ? (
        <span className="mt-2 block rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {loadError}
        </span>
      ) : null}
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Tìm theo tên, email hoặc userId"
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
      />
      <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-500">
            Không có thành viên nào khớp tìm kiếm.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((user) => {
              const checked = selected.has(user.userId);
              return (
                <li key={user.userId}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm transition hover:bg-sky-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => onToggle(user.userId, event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">
                        {user.label}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {user.role} · {user.userId}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Máy chủ sẽ kiểm tra lại tư cách thành viên trước khi lưu (Requirement 6.4).
      </p>
      {error ? <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCustomUserIds(input: string): { valid: string[]; invalid: string[] } {
  const tokens = input
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (!UUID_REGEX.test(token)) {
      invalid.push(token);
      continue;
    }
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    valid.push(token);
  }
  return { valid, invalid };
}
