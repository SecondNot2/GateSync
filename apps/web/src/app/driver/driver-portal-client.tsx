'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Button, SelectInput, TextInput, TextareaInput } from '@/components/ui';
import type { ApiTripSummary, CreateDriverTripMediaPayload } from '@/lib/api/types';
import { createMyDriverTripMedia, loadMyDriverTrips } from '@/lib/operations/data';
import { formatApiDateTime } from '@/lib/operations/view-model';
import { tripStatusLabels } from '@/lib/ui-labels';

const mediaTypeOptions = [
  { value: 'IMAGE', label: 'Hình ảnh' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'DOCUMENT', label: 'Tài liệu' },
  { value: 'OTHER', label: 'Khác' }
];

export function DriverPortalClient() {
  const [trips, setTrips] = useState<ApiTripSummary[]>([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [mediaType, setMediaType] = useState<CreateDriverTripMediaPayload['mediaType']>('IMAGE');
  const [fileName, setFileName] = useState('');
  const [storagePath, setStoragePath] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError(undefined);

      try {
        const result = await loadMyDriverTrips();

        if (isMounted) {
          setTrips(result);
          setSelectedTripId((current) => current || result[0]?.id || '');
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : 'Không thể tải chuyến của tài xế.'
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  async function submitMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTripId) {
      setError('Hãy chọn một chuyến được gán cho tài xế.');
      return;
    }

    if (!storagePath.trim() && !publicUrl.trim()) {
      setError('Cần nhập đường dẫn Supabase Storage hoặc URL minh chứng.');
      return;
    }

    setIsSubmitting(true);
    setError(undefined);
    setNotice(undefined);

    try {
      const payload: CreateDriverTripMediaPayload = {
        mediaType,
        fileName: fileName.trim(),
        occurredAt: new Date().toISOString(),
        metadata: {
          source: 'driver_portal'
        }
      };

      if (storagePath.trim()) {
        payload.storagePath = storagePath.trim();
      }

      if (publicUrl.trim()) {
        payload.publicUrl = publicUrl.trim();
      }

      if (message.trim()) {
        payload.message = message.trim();
      }

      const result = await createMyDriverTripMedia(selectedTripId, payload);
      setNotice(
        `Đã gửi minh chứng cho chuyến ${result.tripCode}. Điều phối sẽ thấy sự kiện trên timeline.`
      );
      setFileName('');
      setStoragePath('');
      setPublicUrl('');
      setMessage('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể gửi minh chứng.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-3 py-4 text-slate-950 sm:px-5 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-4">
        <section className="rounded-[2rem] border border-slate-200 bg-white/95 p-5 shadow-soft sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Cổng tài xế
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Chuyến được giao và minh chứng</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Tài xế chỉ thấy các chuyến được gán trực tiếp cho tài khoản của mình. Minh chứng được
            ghi vào timeline GateSync, không cấp quyền truy cập dữ liệu tổ chức rộng hơn.
          </p>
        </section>

        {notice ? <NoticePanel message={notice} tone="info" /> : null}
        {error ? <NoticePanel message={error} tone="error" /> : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <div className="rounded-[2rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Danh sách chuyến
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {isLoading ? 'Đang tải...' : `${trips.length} chuyến`}
                </h2>
              </div>
              <Button type="button" variant="secondary" onClick={() => void loadMyDriverTrips()}>
                Tải lại
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              {trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => setSelectedTripId(trip.id)}
                  className={`rounded-3xl border px-4 py-4 text-left transition ${
                    selectedTripId === trip.id
                      ? 'border-sky-200 bg-sky-50 ring-2 ring-sky-100'
                      : 'border-slate-100 bg-slate-50 hover:border-sky-100 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{trip.tripCode}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {trip.vehicle?.plateNumber ?? 'Chưa có xe'} ·{' '}
                        {trip.borderGate?.name ?? 'Chưa có cửa khẩu'}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                      {tripStatusLabels[trip.currentStatus]}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Cập nhật {formatApiDateTime(trip.currentStatusUpdatedAt)}
                  </p>
                </button>
              ))}
              {!isLoading && trips.length === 0 ? (
                <p className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-600">
                  Chưa có chuyến nào được gán cho tài khoản tài xế này.
                </p>
              ) : null}
            </div>
          </div>

          <form
            onSubmit={submitMedia}
            className="rounded-[2rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Gửi minh chứng
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Ảnh, tài liệu hoặc URL</h2>
            <div className="mt-4 grid gap-3">
              <SelectInput
                label="Loại minh chứng"
                value={mediaType}
                options={mediaTypeOptions}
                onChange={(event) =>
                  setMediaType(event.target.value as CreateDriverTripMediaPayload['mediaType'])
                }
              />
              <TextInput
                label="Tên file"
                placeholder="seal-photo.jpg"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                required
              />
              <TextInput
                label="Supabase storage path"
                placeholder="trip-media/org/trip/seal-photo.jpg"
                value={storagePath}
                onChange={(event) => setStoragePath(event.target.value)}
              />
              <TextInput
                label="URL minh chứng"
                placeholder="https://..."
                value={publicUrl}
                onChange={(event) => setPublicUrl(event.target.value)}
              />
              <TextareaInput
                label="Ghi chú"
                placeholder="Ảnh niêm phong sau khi vào bãi"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              fullWidth
              className="mt-4"
              disabled={isSubmitting || !selectedTripId || !fileName.trim()}
            >
              {isSubmitting ? 'Đang gửi...' : 'Gửi minh chứng'}
            </Button>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              File upload thực tế nên dùng Supabase Storage policy phía client; endpoint này chỉ lưu
              metadata và tạo sự kiện timeline đã phân quyền theo tài xế.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

function NoticePanel({ message, tone }: { message: string; tone: 'info' | 'error' }) {
  return (
    <div
      className={`rounded-3xl border px-5 py-4 text-sm font-semibold ${
        tone === 'info'
          ? 'border-sky-100 bg-sky-50 text-sky-800'
          : 'border-rose-100 bg-rose-50 text-rose-800'
      }`}
    >
      {message}
    </div>
  );
}
