import { AppShell } from '@/components/app-shell';
import { SkeletonBlock } from '@/components/ui';

type OperationsPageLoadingProps = {
  activeNav: 'dashboard' | 'trips' | 'integrations' | 'admin';
  eyebrow: string;
  title: string;
  description: string;
};

export function OperationsPageLoading({
  activeNav,
  eyebrow,
  title,
  description
}: OperationsPageLoadingProps) {
  return (
    <AppShell activeNav={activeNav} eyebrow={eyebrow} title={title} description={description}>
      <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="mt-4 h-8 w-72 max-w-full" />
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
            <SkeletonBlock className="h-28" />
          </div>
        </div>
        <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="mt-4 h-10 w-20" />
          <SkeletonBlock className="mt-4 h-20" />
        </div>
      </section>
      <section className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-soft sm:p-5">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="mt-4 h-8 w-64 max-w-full" />
        <div className="mt-5 space-y-3">
          <SkeletonBlock className="h-20" />
          <SkeletonBlock className="h-20" />
          <SkeletonBlock className="h-20" />
        </div>
      </section>
    </AppShell>
  );
}
