import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, subMonths } from 'date-fns';
import {
  Building2,
  Calendar,
  Clock,
  TrendingUp,
  Briefcase,
  CheckCircle2,
  XCircle,
  BellRing,
  ExternalLink,
  Plus,
  Send,
  Upload,
  CalendarPlus,
  Percent,
  Activity,
} from 'lucide-react';
import { STATUS_LABELS, type Job } from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { useUIStore } from '@/store/useUIStore';
import { cn, formatDate, computeFunnel } from '@/lib/utils';
import { GoalRing } from '@/components/Common/GoalRing';
import { OfferComparison } from '@/components/Dashboard/OfferComparison';

interface Deadline {
  job: Job;
  label: string;
  date: string;
}

// Hex values, not Tailwind classes — recharts renders raw SVG and can't
// resolve CSS custom properties/utility classes. Mirrors the palette
// used on the Analytics page so the two never look mismatched.
const COLORS = {
  brass: '#3652CC',
  forest: '#2F6F4E',
  inkFaint: '#94A3B8',
};

function daysUntil(iso: string): number {
  const target = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyClasses(days: number): string {
  if (days <= 7) return 'border-brick/30 bg-brick/5';
  if (days <= 30) return 'border-brass/30 bg-brass/5';
  return 'border-ink/10 dark:border-white/10';
}

function urgencyDot(days: number): string {
  if (days <= 7) return 'bg-brick';
  if (days <= 30) return 'bg-brass';
  return 'bg-slate';
}

export function DashboardPage() {
  const jobs = useDocketStore((s) => s.jobs);
  const companies = useDocketStore((s) => s.companies);
  const recruiters = useDocketStore((s) => s.recruiters);
  const timelineEvents = useDocketStore((s) => s.timelineEvents);
  const openJobModal = useUIStore((s) => s.openJobModal);
  const navigate = useNavigate();

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? 'Unknown company';

  const liveJobs = useMemo(() => jobs.filter((j) => !j.deletedAt), [jobs]);

  // ---- Core KPIs -----------------------------------------------------------
  const kpis = useMemo(() => {
    const total = liveJobs.length;
    const active = liveJobs.filter((j) => j.status !== 'archived' && j.status !== 'rejected').length;
    const applied = liveJobs.filter((j) => j.status !== 'wishlist' && j.status !== 'ready').length;
    const interviewing = liveJobs.filter((j) => j.status === 'interview' || j.status === 'assessment').length;
    const offers = liveJobs.filter((j) => j.status === 'offer' || j.status === 'accepted').length;
    const rejections = liveJobs.filter((j) => j.status === 'rejected').length;

    // "Responded" = anything past the silent-wait "Applied" stage, whichever
    // way it went — used for the response-rate stat below, distinct from
    // interview rate (which only counts interview-or-further outcomes).
    const responded = liveJobs.filter(
      (j) =>
        j.status === 'assessment' ||
        j.status === 'interview' ||
        j.status === 'reference_check' ||
        j.status === 'offer' ||
        j.status === 'accepted' ||
        j.status === 'rejected',
    ).length;
    const interviewedOrFurther = liveJobs.filter(
      (j) =>
        j.status === 'interview' ||
        j.status === 'reference_check' ||
        j.status === 'offer' ||
        j.status === 'accepted',
    ).length;

    // Pending follow-ups: recruiter contacts whose next-follow-up date has
    // already arrived (due today or overdue) — this is the actionable
    // count, not just "anyone with a date set in the future".
    const pendingFollowUps = recruiters.filter(
      (r) => !r.deletedAt && r.nextFollowUp && daysUntil(r.nextFollowUp) <= 0,
    ).length;

    return {
      total,
      active,
      interviewing,
      offers,
      rejections,
      pendingFollowUps,
      interviewRate: applied > 0 ? Math.round((interviewedOrFurther / applied) * 100) : 0,
      offerRate: applied > 0 ? Math.round((offers / applied) * 100) : 0,
      responseRate: applied > 0 ? Math.round((responded / applied) * 100) : 0,
    };
  }, [liveJobs, recruiters]);

  const tiles = [
    { label: 'Total applications', value: kpis.total, icon: Briefcase, tone: 'text-ink', bg: 'bg-ink/10' },
    { label: 'Active applications', value: kpis.active, icon: TrendingUp, tone: 'text-brass', bg: 'bg-brass/10' },
    { label: 'Interviews', value: kpis.interviewing, icon: Clock, tone: 'text-slate', bg: 'bg-slate/10' },
    { label: 'Offers', value: kpis.offers, icon: CheckCircle2, tone: 'text-forest', bg: 'bg-forest/10' },
    { label: 'Rejections', value: kpis.rejections, icon: XCircle, tone: 'text-brick', bg: 'bg-brick/10' },
    {
      label: 'Pending follow-ups',
      value: kpis.pendingFollowUps,
      icon: BellRing,
      tone: 'text-brass-dim',
      bg: 'bg-brass/10',
      alert: kpis.pendingFollowUps > 0,
    },
  ];

  const rateTiles = [
    { label: 'Interview rate', value: `${kpis.interviewRate}%`, icon: Percent },
    { label: 'Offer rate', value: `${kpis.offerRate}%`, icon: Percent },
    { label: 'Response rate', value: `${kpis.responseRate}%`, icon: Activity },
  ];

  // ---- Monthly trend (last 6 months, by application date) ------------------
  const trendData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => subMonths(new Date(), 5 - i));
    return months.map((month) => {
      const key = format(month, 'yyyy-MM');
      const count = liveJobs.filter((j) => j.applicationDate?.slice(0, 7) === key).length;
      return { month: format(month, 'MMM'), count };
    });
  }, [liveJobs]);

  // ---- Conversion funnel (furthest stage each job ever reached) ------------
  const funnel = useMemo(() => {
    const eventsByJob = new Map<string, { label: string }[]>();
    for (const ev of timelineEvents) {
      if (ev.deletedAt) continue;
      const list = eventsByJob.get(ev.jobId) ?? [];
      list.push({ label: ev.label });
      eventsByJob.set(ev.jobId, list);
    }
    return computeFunnel(liveJobs, eventsByJob, STATUS_LABELS, (j) => (j as Job).id);
  }, [liveJobs, timelineEvents]);

  // ---- Today's tasks: anything due right now, all in one place -------------
  const todayTasks = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    type Task = { key: string; label: string; sub: string; tone: 'brick' | 'brass' | 'forest' };

    const tasks: Task[] = [];

    for (const job of liveJobs) {
      if (job.deadline?.slice(0, 10) === todayIso) {
        tasks.push({
          key: `${job.id}-deadline`,
          label: `${job.position} · ${companyName(job.companyId)}`,
          sub: 'Application deadline today',
          tone: 'brick',
        });
      }
      if (job.interviewDate?.slice(0, 10) === todayIso) {
        tasks.push({
          key: `${job.id}-interview`,
          label: `${job.position} · ${companyName(job.companyId)}`,
          sub: 'Interview today',
          tone: 'forest',
        });
      }
    }

    for (const r of recruiters) {
      if (r.deletedAt || !r.nextFollowUp) continue;
      const days = daysUntil(r.nextFollowUp);
      if (days > 0) continue;
      tasks.push({
        key: `${r.id}-followup`,
        label: r.name,
        sub: days === 0 ? 'Follow up today' : `Follow up — ${Math.abs(days)}d overdue`,
        tone: days < 0 ? 'brick' : 'brass',
      });
    }

    return tasks;
  }, [liveJobs, recruiters, companies]);

  const recentActivity = useMemo(
    () =>
      [...liveJobs]
        .filter((j) => !j.archivedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
    [liveJobs],
  );

  const upcomingDeadlines = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const entries: Deadline[] = [];
    for (const job of liveJobs) {
      if (job.archivedAt) continue;
      if (job.deadline && job.deadline.slice(0, 10) > todayIso) {
        entries.push({ job, label: 'Application deadline', date: job.deadline });
      }
      if (job.interviewDate && job.interviewDate.slice(0, 10) > todayIso) {
        entries.push({ job, label: 'Interview', date: job.interviewDate });
      }
    }
    return entries.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [liveJobs]);

  const quickActions = [
    { label: 'Add job', icon: Plus, onClick: () => openJobModal('new') },
    { label: 'Follow up', icon: Send, onClick: () => navigate('/recruiters') },
    { label: 'Upload resume', icon: Upload, onClick: () => navigate('/documents') },
    { label: 'Schedule interview', icon: CalendarPlus, onClick: () => navigate('/calendar') },
  ];

  return (
    <div className="h-full overflow-auto px-6 pb-8 pt-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-ink-faint">Where your job search stands right now</p>
      </div>

      <div className="mt-5 rounded-2xl bg-white p-5 shadow-card dark:bg-night-panel">
        <h2 className="font-display text-base font-semibold">Quick actions</h2>
        <div className="mt-4 grid grid-cols-4 gap-3 sm:gap-6">
          {quickActions.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="flex flex-col items-center gap-2 text-center"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper-dim transition-colors hover:bg-brass/10 dark:bg-white/5">
                <Icon className="h-5 w-5 text-brass" />
              </span>
              <span className="text-[11px] font-medium leading-tight text-ink-soft dark:text-paper/70">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <GoalRing />
      </div>

      {/* Core KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(({ label, value, icon: Icon, tone, bg, alert }) => (
          <div
            key={label}
            className={cn(
              'rounded-lg border bg-white p-4 shadow-card dark:bg-night-panel',
              alert ? 'border-brass/40' : 'border-ink/10 dark:border-white/10',
            )}
          >
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-md', bg)}>
              <Icon className={cn('h-4.5 w-4.5', tone)} />
            </div>
            <div className="mt-3 font-display text-3xl font-semibold">{value}</div>
            <div className="text-xs text-ink-faint">{label}</div>
          </div>
        ))}
      </div>

      {/* Rates strip */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rateTiles.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-lg border border-ink/10 bg-white px-4 py-3 shadow-card dark:border-white/10 dark:bg-night-panel"
          >
            <div>
              <div className="font-display text-xl font-semibold">{value}</div>
              <div className="text-xs text-ink-faint">{label}</div>
            </div>
            <Icon className="h-4 w-4 text-ink-faint" />
          </div>
        ))}
      </div>

      <OfferComparison jobs={jobs} companies={companies} />

      {/* Trend + funnel */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">Applications over time</h2>
          <p className="text-xs text-ink-faint">New applications by month, last 6 months</p>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,138,0.08)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: COLORS.inkFaint }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.inkFaint }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(30,58,138,0.1)' }} />
                <Bar dataKey="count" fill={COLORS.brass} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">Conversion funnel</h2>
          <p className="text-xs text-ink-faint">Furthest stage every application has reached</p>
          <div className="mt-4 flex flex-col gap-2">
            {funnel.map((stage) => (
              <div key={stage.stage} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-ink-faint">{stage.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/5 dark:bg-white/5">
                  <div
                    className="h-full rounded-full bg-forest"
                    style={{
                      width: `${funnel[0]?.count ? Math.round((stage.count / funnel[0].count) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-xs text-ink-soft dark:text-paper/70">
                  {stage.count}
                  {stage.conversionFromPrev !== null && (
                    <span className="ml-1 text-ink-faint">({stage.conversionFromPrev}%)</span>
                  )}
                </span>
              </div>
            ))}
            {funnel.every((s) => s.count === 0) && (
              <p className="py-6 text-center text-sm text-ink-faint">
                No applications yet — this fills in once you apply.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Today's tasks */}
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">Today's tasks</h2>
          <p className="text-xs text-ink-faint">Deadlines, interviews, and follow-ups due now</p>

          <div className="mt-4 flex flex-col gap-2">
            {todayTasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-faint">Nothing due today — you're clear.</p>
            ) : (
              todayTasks.map((task) => (
                <div
                  key={task.key}
                  className={cn(
                    'flex items-center gap-3 rounded-md border px-3 py-2.5',
                    task.tone === 'brick'
                      ? 'border-brick/30 bg-brick/5'
                      : task.tone === 'brass'
                        ? 'border-brass/30 bg-brass/5'
                        : 'border-forest/30 bg-forest/5',
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      task.tone === 'brick' ? 'bg-brick' : task.tone === 'brass' ? 'bg-brass' : 'bg-forest',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink dark:text-paper">{task.label}</p>
                    <p className="text-xs text-ink-faint">{task.sub}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">Recent Activity</h2>
          <p className="text-xs text-ink-faint">Latest updates across your applications</p>

          <div className="mt-4 flex flex-col gap-3">
            {recentActivity.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-faint">
                Nothing yet — add your first application from The Board.
              </p>
            ) : (
              recentActivity.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-3 border-b border-dashed border-ink/10 pb-3 last:border-0 last:pb-0 dark:border-white/10"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/10">
                    <Building2 className="h-4 w-4 text-ink" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink dark:text-paper">
                      {job.position}
                      <span className="font-normal text-ink-faint"> · {companyName(job.companyId)}</span>
                    </p>
                    <p className="text-xs text-ink-faint">{STATUS_LABELS[job.status]}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                    {formatDate(job.updatedAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Upcoming Deadlines */}
      <div className="mt-5 rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
        <h2 className="font-display text-lg font-semibold">Upcoming Deadlines</h2>
        <p className="text-xs text-ink-faint">Application deadlines and interviews ahead</p>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {upcomingDeadlines.length === 0 ? (
            <p className="col-span-full py-8 text-center text-sm text-ink-faint">
              Nothing coming up. You're all caught up.
            </p>
          ) : (
            upcomingDeadlines.map(({ job, label, date }, i) => {
              const days = daysUntil(date);
              return (
                <div
                  key={`${job.id}-${label}-${i}`}
                  className={cn('flex items-center gap-3 rounded-md border px-3 py-2.5', urgencyClasses(days))}
                >
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', urgencyDot(days))} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink dark:text-paper">
                      {job.position} <span className="font-normal text-ink-faint">· {companyName(job.companyId)}</span>
                    </p>
                    <p className="text-xs text-ink-faint">{label}</p>
                  </div>
                  {job.jobUrl && (
                    <a
                      href={job.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open job posting"
                      className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:bg-ink/5 hover:text-brass dark:hover:bg-white/5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <div className="shrink-0 text-right">
                    <p className="flex items-center gap-1 font-mono text-xs font-semibold text-ink dark:text-paper">
                      <Calendar className="h-3 w-3" />
                      {formatDate(date)}
                    </p>
                    <p className="text-[10px] text-ink-faint">
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
