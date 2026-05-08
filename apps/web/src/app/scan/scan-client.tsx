'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Button, TextInput } from '@/components/ui';
import { gatesyncApi } from '@/lib/api/gatesync';
import { resolveWebApiSession } from '@/lib/api/session';
import type { OrganizationAccessIssue } from '@/lib/operations/errors';
import type { DashboardViewData } from '@/lib/operations/view-model';

type ScanClientProps = {
  initialData?: DashboardViewData;
  initialError?: string;
  initialOrganizationIssue?: OrganizationAccessIssue;
};

export function ScanClient({
  initialData,
  initialError: _initialError,
  initialOrganizationIssue: _initialOrganizationIssue
}: ScanClientProps = {}) {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<unknown>(null);

  const lookupTrip = useCallback(
    async (code: string) => {
      const trimmed = code.trim();

      if (!trimmed) {
        return;
      }

      setIsLookingUp(true);

      try {
        const session = await resolveWebApiSession();

        if (session.mode === 'dev') {
          toast.error('Chế độ dev — không thể tra cứu chuyến.');
          return;
        }

        const orgId = initialData?.organization?.id;

        if (!orgId) {
          toast.error('Không xác định được tổ chức.');
          return;
        }

        const result = await gatesyncApi.listTrips(
          orgId,
          { search: trimmed, limit: 1 },
          { accessToken: session.accessToken }
        );

        const trip = result[0];

        if (trip) {
          toast.success(`Tìm thấy chuyến ${trip.tripCode}`);
          router.push(`/trips/${trip.id}`);
        } else {
          toast.error('Không tìm thấy chuyến với mã này.');
        }
      } catch {
        toast.error('Lỗi khi tra cứu chuyến.');
      } finally {
        setIsLookingUp(false);
      }
    },
    [router, initialData?.organization?.id]
  );

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || typeof window === 'undefined') {
      return;
    }

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          void scanner.stop().then(() => {
            setIsScanning(false);
            void lookupTrip(decodedText);
          });
        },
        () => {
          // QR code not found in frame — ignore
        }
      );

      setIsScanning(true);
    } catch {
      toast.error('Không thể truy cập camera. Vui lòng sử dụng mã thủ công.');
    }
  }, [lookupTrip]);

  const stopScanner = useCallback(async () => {
    const scanner = html5QrCodeRef.current as { stop: () => Promise<void> } | null;

    if (scanner) {
      try {
        await scanner.stop();
      } catch {
        // Ignore stop errors
      }
    }

    setIsScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      const scanner = html5QrCodeRef.current as { stop: () => Promise<void> } | null;

      if (scanner) {
        void scanner.stop().catch(() => {
          // Ignore cleanup errors
        });
      }
    };
  }, []);

  const shellProps = initialData?.organization ? { organization: initialData.organization } : {};

  return (
    <AppShell
      activeNav="dashboard"
      eyebrow="Quét mã"
      title="Quét phiếu điều động"
      description="Quét QR code hoặc barcode trên phiếu điều động để mở nhanh chuyến xe."
      {...shellProps}
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div id="qr-reader" ref={scannerRef} className="min-h-[300px]" />
          {!isScanning ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <svg
                className="h-16 w-16 text-slate-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <rect x="7" y="7" width="4" height="4" />
                <rect x="13" y="7" width="4" height="4" />
                <rect x="7" y="13" width="4" height="4" />
                <path d="M13 13h4v4h-4z" />
              </svg>
              <p className="mt-3 text-sm text-slate-500">Nhấn nút bên dưới để bắt đầu quét</p>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          variant={isScanning ? 'danger' : 'primary'}
          fullWidth
          onClick={() => (isScanning ? void stopScanner() : void startScanner())}
        >
          {isScanning ? 'Dừng quét' : 'Bắt đầu quét'}
        </Button>

        <div className="relative flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Hoặc nhập mã thủ công
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookupTrip(manualCode);
          }}
          className="flex gap-2"
        >
          <div className="flex-1">
            <TextInput
              label="Mã chuyến hoặc biển số"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="VD: GS-2026-0001"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isLookingUp || !manualCode.trim()}>
              {isLookingUp ? 'Đang tìm...' : 'Tìm'}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
