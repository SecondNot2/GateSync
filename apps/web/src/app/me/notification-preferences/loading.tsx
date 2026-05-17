import { AppShell } from '@/components/app-shell';
import { SkeletonBlock } from '@/components/ui';

export default function NotificationPreferencesLoading() {
  return (
    <AppShell
      activeNav="settings"
      eyebrow="Tài khoản của tôi"
      title="Tùy chọn thông báo"
      description="Đang tải tùy chọn nhận thông báo của bạn."
    >
      <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="mt-4 h-8 w-64 max-w-full" />
        <div className="mt-6 space-y-3">
          <SkeletonBlock className="h-12" />
          <SkeletonBlock className="h-12" />
          <SkeletonBlock className="h-12" />
          <SkeletonBlock className="h-12" />
          <SkeletonBlock className="h-12" />
        </div>
      </section>
    </AppShell>
  );
}
