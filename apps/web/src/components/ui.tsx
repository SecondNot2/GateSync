'use client';

import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

type FieldProps = {
  label: string;
  hint?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'soft' | 'danger' | 'ghost';
  fullWidth?: boolean;
};

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string | undefined;
  wrapperClassName?: string | undefined;
};

type TextareaInputProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string | undefined;
  wrapperClassName?: string | undefined;
};

type SelectInputProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label: string;
  hint?: string | undefined;
  wrapperClassName?: string | undefined;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
};

type StatePanelProps = {
  message: string;
  tone?: 'default' | 'loading' | 'error' | 'info' | 'warning';
  className?: string | undefined;
};

type CalendarDay = {
  key: string;
  label: number;
  value: Date;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
};

const labelClassName = 'text-xs font-semibold uppercase tracking-[0.16em] text-slate-500';
const controlClassName =
  'mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';
const textareaClassName =
  'mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';
const panelClassName =
  'absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/10 ring-1 ring-slate-950/5';

export function Field({ label, hint, className, children }: FieldProps) {
  return (
    <div className={`block ${className ?? ''}`}>
      <span className={labelClassName}>{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-xs leading-5 text-slate-500">{hint}</span> : null}
    </div>
  );
}

export function TextInput({ label, hint, wrapperClassName, className, ...props }: TextInputProps) {
  return (
    <Field label={label} hint={hint} className={wrapperClassName}>
      <input
        {...props}
        aria-label={props['aria-label'] ?? label}
        className={`${controlClassName} ${className ?? ''}`}
      />
    </Field>
  );
}

export function SearchInput(props: TextInputProps) {
  return <TextInput {...props} type="search" />;
}

export function DateInput(props: TextInputProps) {
  return <CalendarInput {...props} mode="date" />;
}

export function DateTimeInput(props: TextInputProps) {
  return <CalendarInput {...props} mode="datetime" />;
}

export function TextareaInput({
  label,
  hint,
  wrapperClassName,
  className,
  ...props
}: TextareaInputProps) {
  return (
    <Field label={label} hint={hint} className={wrapperClassName}>
      <textarea
        {...props}
        aria-label={props['aria-label'] ?? label}
        className={`${textareaClassName} ${className ?? ''}`}
      />
    </Field>
  );
}

export function SelectInput({
  label,
  hint,
  wrapperClassName,
  className,
  options,
  value,
  name,
  disabled,
  required,
  onChange,
  ...props
}: SelectInputProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const stringValue = String(value ?? '');
  const selectedOption = options.find((option) => option.value === stringValue);

  useDismissibleLayer(wrapperRef, isOpen, () => setIsOpen(false));

  function selectOption(nextValue: string) {
    onChange?.({
      target: { value: nextValue, name },
      currentTarget: { value: nextValue, name }
    } as unknown as ChangeEvent<HTMLSelectElement>);
    setIsOpen(false);
  }

  return (
    <Field label={label} hint={hint} className={wrapperClassName}>
      <div ref={wrapperRef} className="relative">
        {name ? <input type="hidden" name={name} value={stringValue} required={required} /> : null}
        <button
          type="button"
          disabled={disabled}
          aria-label={props['aria-label'] ?? label}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
          className={`${controlClassName} flex items-center justify-between gap-3 text-left font-semibold disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${className ?? ''}`}
        >
          <span className="min-w-0 truncate">{selectedOption?.label ?? 'Chọn giá trị'}</span>
          <span className={`text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
        </button>
        {isOpen ? (
          <div className={panelClassName}>
            <div className="max-h-72 overflow-y-auto p-2">
              {options.map((option) => {
                const isSelected = option.value === stringValue;

                return (
                  <button
                    key={option.value || option.label}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => selectOption(option.value)}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:text-slate-300 ${
                      isSelected
                        ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-100'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-sky-700">
                        Chọn
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  );
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const variantClassName = {
    primary: 'bg-slate-950 text-white shadow-soft hover:bg-slate-800 disabled:bg-slate-400',
    secondary:
      'border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-700 disabled:bg-slate-50 disabled:text-slate-400',
    soft: 'border border-sky-100 bg-sky-50 text-sky-800 hover:bg-sky-100 disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-400',
    danger:
      'border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-sky-700 hover:text-sky-900 disabled:text-slate-400'
  }[variant];

  return (
    <button
      {...props}
      className={`min-h-11 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${
        fullWidth ? 'w-full' : ''
      } ${variantClassName} ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function StatePanel({ message, tone = 'default', className }: StatePanelProps) {
  const toneClassName = {
    default: 'border-dashed border-slate-200 bg-slate-50 text-slate-600',
    loading: 'border-slate-200 bg-white text-slate-600 shadow-soft',
    error: 'border-rose-100 bg-rose-50 text-rose-700',
    info: 'border-sky-100 bg-sky-50 text-sky-800',
    warning: 'border-amber-100 bg-amber-50 text-amber-800'
  }[tone];

  return (
    <div className={`rounded-3xl border p-4 text-sm ${toneClassName} ${className ?? ''}`}>
      {message}
    </div>
  );
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-100 ${className}`} />;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

function CalendarInput({
  label,
  hint,
  wrapperClassName,
  className,
  value,
  name,
  disabled,
  required,
  onChange,
  mode,
  placeholder,
  ...props
}: TextInputProps & { mode: 'date' | 'datetime' }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stringValue = String(value ?? '');
  const parsedValue = useMemo(() => parseInputDateValue(stringValue), [stringValue]);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parsedValue?.date ?? new Date());
  const timeValue = parsedValue?.time ?? '08:00';
  const calendarDays = useMemo(
    () => buildCalendarDays(viewDate, parsedValue?.date),
    [parsedValue?.date, viewDate]
  );

  useDismissibleLayer(wrapperRef, isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (parsedValue?.date) {
      setViewDate(parsedValue.date);
    }
  }, [parsedValue?.date]);

  function emitValue(nextDate: Date, nextTime = timeValue) {
    const nextDateValue = toDateInputValue(nextDate);
    const nextValue = mode === 'datetime' ? `${nextDateValue}T${nextTime}` : nextDateValue;
    onChange?.({
      target: { value: nextValue, name },
      currentTarget: { value: nextValue, name }
    } as unknown as ChangeEvent<HTMLInputElement>);
  }

  function clearValue() {
    onChange?.({
      target: { value: '', name },
      currentTarget: { value: '', name }
    } as unknown as ChangeEvent<HTMLInputElement>);
    setIsOpen(false);
  }

  function updateTime(nextTime: string) {
    const nextDate = parsedValue?.date ?? new Date();
    emitValue(nextDate, nextTime);
  }

  return (
    <Field label={label} hint={hint} className={wrapperClassName}>
      <div ref={wrapperRef} className="relative">
        {name ? <input type="hidden" name={name} value={stringValue} required={required} /> : null}
        <button
          type="button"
          disabled={disabled}
          aria-label={props['aria-label'] ?? label}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
          className={`${controlClassName} flex items-center justify-between gap-3 text-left font-semibold disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${className ?? ''}`}
        >
          <span className={`min-w-0 truncate ${value ? 'text-slate-800' : 'text-slate-400'}`}>
            {formatCalendarDisplay(stringValue, mode) || placeholder || 'Chọn ngày'}
          </span>
          <span className="text-slate-400">◷</span>
        </button>
        {isOpen ? (
          <div className={panelClassName}>
            <div className="p-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setViewDate(addMonths(viewDate, -1))}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-700 transition hover:border-sky-200 hover:text-sky-700"
                >
                  ‹
                </button>
                <p className="text-sm font-bold text-slate-950">
                  Tháng {viewDate.getMonth() + 1}/{viewDate.getFullYear()}
                </p>
                <button
                  type="button"
                  onClick={() => setViewDate(addMonths(viewDate, 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-700 transition hover:border-sky-200 hover:text-sky-700"
                >
                  ›
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((weekday) => (
                  <span key={weekday} className="py-1">
                    {weekday}
                  </span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => emitValue(day.value)}
                    className={`flex h-9 items-center justify-center rounded-2xl text-sm font-semibold transition ${
                      day.isSelected
                        ? 'bg-slate-950 text-white shadow-soft'
                        : day.isToday
                          ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-100'
                          : day.isCurrentMonth
                            ? 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                            : 'text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>

              {mode === 'datetime' ? (
                <label className="mt-3 block rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Giờ ghi nhận
                  </span>
                  <input
                    type="time"
                    value={timeValue}
                    onChange={(event) => updateTime(event.target.value)}
                    className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none"
                  />
                </label>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    emitValue(today);
                    setViewDate(today);
                    setIsOpen(false);
                  }}
                  className="rounded-2xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  Hôm nay
                </button>
                {!required ? (
                  <button
                    type="button"
                    onClick={clearValue}
                    className="rounded-2xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                  >
                    Xóa
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function useDismissibleLayer(
  wrapperRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, wrapperRef]);
}

function parseInputDateValue(value: string) {
  if (!value) {
    return undefined;
  }

  const [datePart = '', timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);

  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return {
    date,
    time: timePart?.slice(0, 5)
  };
}

function buildCalendarDays(viewDate: Date, selectedDate?: Date): CalendarDay[] {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - startOffset);
  const todayValue = toDateInputValue(new Date());
  const selectedValue = selectedDate ? toDateInputValue(selectedDate) : undefined;

  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(startDate);
    value.setDate(startDate.getDate() + index);
    const key = toDateInputValue(value);

    return {
      key,
      label: value.getDate(),
      value,
      isCurrentMonth: value.getMonth() === viewDate.getMonth(),
      isSelected: key === selectedValue,
      isToday: key === todayValue
    };
  });
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatCalendarDisplay(value: string, mode: 'date' | 'datetime') {
  const parsedValue = parseInputDateValue(value);

  if (!parsedValue) {
    return '';
  }

  const day = String(parsedValue.date.getDate()).padStart(2, '0');
  const month = String(parsedValue.date.getMonth() + 1).padStart(2, '0');
  const year = parsedValue.date.getFullYear();
  const dateLabel = `${day}/${month}/${year}`;

  if (mode === 'date') {
    return dateLabel;
  }

  return `${dateLabel} · ${parsedValue.time ?? '08:00'}`;
}
