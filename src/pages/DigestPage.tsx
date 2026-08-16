import { useMemo } from 'react';
import {
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  Sparkles,
  CalendarDays,
} from 'lucide-react';
import { STATUS_LABELS } from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { formatDate, cn, daysSince, isStaleJob } from '@/lib/utils';
import { InboxSignals } from '@/components/Digest/InboxSignals';

// Ported from the sample app's "Weekly Digest" tab — a single-page rollup
// of the week's activity so the person doesn't have to piece it together
// from the Board, Recruiters, and Calendar separately.

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function weekRangeLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

export function DigestPage() {
  const jobs = useDocketStore((s) => s.jobs);
  const companies = useDocketStore((s) => s.companies);
  const recruiters = useDocketStore((s) => s.recruiters);

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? 'Unknown company';

  const digest = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = startOfWeek(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);

    const activeJobs = jobs.filter((j) => !j.deletedAt && !j.archivedAt);

    const appliedThisWeek = activeJobs.filter((j) => {
      if (!j.applicationDate) return false;
      const d = new Date(j.applicationDate);
      return d >= weekStart && d <= weekEnd;
    });

    const overdueFollowUps = recruiters
      .filter((r) => !r.deletedAt && r.nextFollowUp && new Date(r.nextFollowUp) < today)
      .sort((a, b) => (a.nextFollowUp ?? '').localeCompare(b.nextFollowUp ?? ''));

    const upcomingFollowUps = recruiters
      .filter(
        (r) =>
          !r.deletedAt && r.nextFollowUp && new Date(r.nextFollowUp) >= today && new Date(r.nextFollowUp) <= in7Days,
      )
      .sort((a, b) => (a.nextFollowUp ?? '').localeCompare(b.nextFollowUp ?? ''));

    const activeInterviewsAndOffers = activeJobs.filter(
      (j) => j.status === 'interview' || j.status === 'assessment' || j.status === 'offer',
    );

    const staleApplications = activeJobs
      .filter(isStaleJob)
      .sort((a, b) => (daysSince(b.updatedAt) ?? 0) - (daysSince(a.updatedAt) ?? 0));

    const totalActive = activeJobs.filter((j) => j.status !== 'rejected' && j.status !== 'archived').length;
    const respondedCount = activeJobs.filter((j) =>
      ['interview', 'assessment', 'offer', 'accepted', 'reference_check'].includes(j.status),
    ).length;
    const appliedCount = activeJobs.filter((j) => j.status !== 'wishlist' && j.status !== 'ready').length;
    const responseRate = appliedCount > 0 ? Math.round((respondedCount / appliedCount) * 100) : 0;

    return {
      weekStart,
      appliedThisWeek,
      overdueFollowUps,
      upcomingFollowUps,
      activeInterviewsAndOffers,
      staleApplications,
      totalActive,
      responseRate,
    };
  }, [jobs, recruiters]);

  return (
    <div className="h-full overflow-auto px-6 pb-8 pt-5">
      <div className="rounded-lg bg-gradient-to-br from-brass to-brass-soft p-6 text-white shadow-stamp">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
          <Sparkles className="h-5 w-5" />
          Weekly Digest
        </h1>
        <p className="mt-1 text-sm text-white/80">{weekRangeLabel(digest.weekStart)}</p>
      </div>

      {/* At a glance */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-ink/10 bg-white p-4 text-center shadow-card dark:border-white/10 dark:bg-night-panel">
          <div className="font-display text-2xl font-semibold text-brass">{digest.appliedThisWeek.length}</div>
          <div className="mt-1 text-xs text-ink-faint">Applied this week</div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white p-4 text-center shadow-card dark:border-white/10 dark:bg-night-panel">
          <div className="font-display text-2xl font-semibold text-brass">{digest.responseRate}%</div>
          <div className="mt-1 text-xs text-ink-faint">Response rate</div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white p-4 text-center shadow-card dark:border-white/10 dark:bg-night-panel">
          <div
            className={cn(
              'font-display text-2xl font-semibold',
              digest.overdueFollowUps.length > 0 ? 'text-brick' : 'text-forest',
            )}
          >
            {digest.overdueFollowUps.length}
          </div>
          <div className="mt-1 text-xs text-ink-faint">Overdue follow-ups</div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white p-4 text-center shadow-card dark:border-white/10 dark:bg-night-panel">
          <div
            className={cn(
              'font-display text-2xl font-semibold',
              digest.staleApplications.length > 0 ? 'text-brass' : 'text-forest',
            )}
          >
            {digest.staleApplications.length}
          </div>
          <div className="mt-1 text-xs text-ink-faint">Gone quiet</div>
        </div>
      </div>

      <InboxSignals />

      {/* Stale applications - sitting in an active stage with no movement */}
      {digest.staleApplications.length > 0 && (
        <Section title="Gone Quiet" icon={<Clock className="h-3.5 w-3.5" />} tone="brass">
          {digest.staleApplications.map((j) => {
            const idle = daysSince(j.updatedAt);
            return (
              <Row
                key={j.id}
                dotClass="bg-brass"
                title={j.position}
                subtitle={`${companyName(j.companyId)} · ${STATUS_LABELS[j.status]}`}
                badge={idle !== null ? `${idle}d idle` : undefined}
              />
            );
          })}
        </Section>
      )}

      {/* Overdue follow-ups */}
      {digest.overdueFollowUps.length > 0 && (
        <Section title="Overdue Follow-ups" icon={<AlertCircle className="h-3.5 w-3.5" />} tone="brick">
          {digest.overdueFollowUps.map((r) => (
            <Row
              key={r.id}
              dotClass="bg-brick"
              title={r.name}
              subtitle={`Was due ${formatDate(r.nextFollowUp)}`}
            />
          ))}
        </Section>
      )}

      {/* Upcoming follow-ups */}
      <Section title="Upcoming Follow-ups (Next 7 Days)" icon={<CalendarDays className="h-3.5 w-3.5" />} tone="brass">
        {digest.upcomingFollowUps.length === 0 ? (
          <EmptyNote text="No follow-ups scheduled — you're all clear." />
        ) : (
          digest.upcomingFollowUps.map((r) => (
            <Row key={r.id} dotClass="bg-brass" title={r.name} subtitle={formatDate(r.nextFollowUp)} />
          ))
        )}
      </Section>

      {/* Applied this week */}
      <Section title="Applied This Week" icon={<TrendingUp className="h-3.5 w-3.5" />} tone="forest">
        {digest.appliedThisWeek.length === 0 ? (
          <EmptyNote text="No applications logged this week yet — time to hunt." />
        ) : (
          digest.appliedThisWeek.map((j) => (
            <Row
              key={j.id}
              dotClass="bg-forest"
              title={j.position}
              subtitle={`${companyName(j.companyId)} · ${STATUS_LABELS[j.status]}`}
            />
          ))
        )}
      </Section>

      {/* Active interviews & offers */}
      {digest.activeInterviewsAndOffers.length > 0 && (
        <Section title="Active Interviews & Offers" icon={<CheckCircle2 className="h-3.5 w-3.5" />} tone="forest">
          {digest.activeInterviewsAndOffers.map((j) => (
            <Row
              key={j.id}
              dotClass={j.status === 'offer' ? 'bg-forest' : 'bg-slate'}
              title={j.position}
              subtitle={companyName(j.companyId)}
              badge={STATUS_LABELS[j.status]}
            />
          ))}
        </Section>
      )}

      {digest.totalActive === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 py-12 text-center text-ink-faint">
          <Clock className="h-8 w-8" strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold text-ink">Nothing tracked yet</p>
          <p className="max-w-xs text-sm">Add applications from The Board to see your weekly digest here.</p>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tone: 'brick' | 'brass' | 'forest';
  children: React.ReactNode;
}) {
  const toneClass = tone === 'brick' ? 'text-brick' : tone === 'forest' ? 'text-forest' : 'text-brass';
  return (
    <div className="mt-4 rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
      <div className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', toneClass)}>
        {icon}
        {title}
      </div>
      <div className="mt-3 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Row({
  dotClass,
  title,
  subtitle,
  badge,
}: {
  dotClass: string;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink dark:text-paper">{title}</p>
        <p className="truncate text-xs text-ink-faint">{subtitle}</p>
      </div>
      {badge && (
        <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium text-ink-soft dark:bg-white/10 dark:text-paper/70">
          {badge}
        </span>
      )}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="py-2 text-sm italic text-ink-faint">{text}</p>;
}
