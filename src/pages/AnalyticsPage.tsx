import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO, subMonths } from 'date-fns';
import { BarChart3, Percent, Timer, Briefcase, FileDown, Hourglass } from 'lucide-react';
import { KANBAN_STATUSES, SOURCE_LABELS, STATUS_LABELS, type ApplicationSource, type EmploymentType, type WorkMode } from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { useDocumentStore } from '@/store/useDocumentStore';
import { cn, computeResumeStats, computeResponseTimeBySource } from '@/lib/utils';
import { exportAnalyticsReportPdf } from '@/lib/report';
import { useToastStore } from '@/store/useToastStore';
import { useEffect, useState } from 'react';

// Hex values, not Tailwind classes — recharts renders raw SVG and can't
// resolve CSS custom properties/utility classes the way the rest of the
// app's markup can. Pulled directly from tailwind.config.js so the chart
// palette stays in sync with the app's accent colors.
const COLORS = {
  brass: '#3652CC',
  brassSoft: '#5B79FF',
  forest: '#2F6F4E',
  forestSoft: '#4A8F6B',
  brick: '#A23B3B',
  brickSoft: '#C1615F',
  slate: '#6B7280',
  inkFaint: '#94A3B8',
};

const PIE_COLORS = [COLORS.brass, COLORS.forest, COLORS.slate, COLORS.brick, COLORS.brassSoft, COLORS.forestSoft];

const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'Onsite',
};

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  casual: 'Casual',
};

export function AnalyticsPage() {
  const jobs = useDocketStore((s) => s.jobs);
  const timelineEvents = useDocketStore((s) => s.timelineEvents);
  const documents = useDocumentStore((s) => s.documents);
  const initDocuments = useDocumentStore((s) => s.init);
  const [isExporting, setIsExporting] = useState(false);

  // Documents live in their own store, only otherwise initialized from the
  // Documents page - if someone lands on Analytics first, resume stats
  // below would silently show nothing without this.
  useEffect(() => {
    void initDocuments();
  }, [initDocuments]);

  const handleDownloadReport = async () => {
    setIsExporting(true);
    try {
      await exportAnalyticsReportPdf();
      useToastStore.getState().push({ message: 'Report downloaded', tone: 'success' });
    } catch {
      useToastStore.getState().push({ message: 'Report generation failed', tone: 'danger' });
    } finally {
      setIsExporting(false);
    }
  };

  const liveJobs = useMemo(() => jobs.filter((j) => !j.deletedAt), [jobs]);

  const statusData = useMemo(
    () =>
      KANBAN_STATUSES.map((status) => ({
        status,
        label: STATUS_LABELS[status],
        count: liveJobs.filter((j) => j.status === status).length,
      })).filter((row) => row.count > 0 || row.status !== 'archived'),
    [liveJobs],
  );

  // Last 6 calendar months, oldest first, counting jobs by applicationDate.
  const trendData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => subMonths(new Date(), 5 - i));
    return months.map((month) => {
      const key = format(month, 'yyyy-MM');
      const count = liveJobs.filter((j) => j.applicationDate?.slice(0, 7) === key).length;
      return { month: format(month, 'MMM'), count };
    });
  }, [liveJobs]);

  const workModeData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of liveJobs) {
      if (!job.workMode) continue;
      counts.set(job.workMode, (counts.get(job.workMode) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([mode, count]) => ({
      name: WORK_MODE_LABELS[mode as WorkMode],
      value: count,
    }));
  }, [liveJobs]);

  const employmentTypeData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of liveJobs) {
      if (!job.employmentType) continue;
      counts.set(job.employmentType, (counts.get(job.employmentType) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([type, count]) => ({
      name: EMPLOYMENT_TYPE_LABELS[type as EmploymentType],
      value: count,
    }));
  }, [liveJobs]);

  const sourceData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of liveJobs) {
      if (!job.source) continue;
      counts.set(job.source, (counts.get(job.source) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([source, count]) => ({
      name: SOURCE_LABELS[source as ApplicationSource],
      value: count,
    }));
  }, [liveJobs]);

  // Resume version performance - which uploaded resume (from the Documents
  // page) tends to land interviews and offers. Only resumes actually linked
  // to at least one application show up here; a freshly-uploaded, unused
  // resume has no rate to report yet.
  const resumeRows = useMemo(() => {
    const resumeStats = computeResumeStats(liveJobs);
    return documents
      .filter((d) => d.type === 'resume')
      .map((doc) => ({ doc, stats: resumeStats.get(doc.id) }))
      .filter((row): row is { doc: (typeof documents)[number]; stats: NonNullable<typeof row.stats> } =>
        Boolean(row.stats),
      )
      .sort((a, b) => b.stats.applications - a.stats.applications);
  }, [documents, liveJobs]);

  // Response time - how long a job sat at Applied before anything
  // happened, grouped by where it came from. Reuses the "Moved to X"
  // timeline events that status changes already log, so no new tracking
  // is needed - just a job's applicationDate + its own timeline.
  const responseStats = useMemo(() => {
    const eventsByJob = new Map<string, { label: string; date: string }[]>();
    for (const e of timelineEvents) {
      if (e.deletedAt) continue;
      const arr = eventsByJob.get(e.jobId) ?? [];
      arr.push({ label: e.label, date: e.date });
      eventsByJob.set(e.jobId, arr);
    }
    const bySource = computeResponseTimeBySource(liveJobs, eventsByJob);
    return Array.from(bySource.values())
      .map((s) => ({ ...s, label: s.key === 'unknown' ? 'Not specified' : SOURCE_LABELS[s.key as ApplicationSource] }))
      .sort((a, b) => a.medianDays - b.medianDays);
  }, [liveJobs, timelineEvents]);

  const overallMedianResponseDays = useMemo(() => {
    if (responseStats.length === 0) return null;
    const totalCount = responseStats.reduce((sum, s) => sum + s.count, 0);
    if (totalCount === 0) return null;
    const weighted = responseStats.reduce((sum, s) => sum + s.medianDays * s.count, 0);
    return Math.round(weighted / totalCount);
  }, [responseStats]);

  const stats = useMemo(() => {
    const total = liveJobs.length;
    const applied = liveJobs.filter((j) => j.status !== 'wishlist' && j.status !== 'ready').length;
    const interviewed = liveJobs.filter(
      (j) => j.status === 'interview' || j.status === 'reference_check' || j.status === 'offer' || j.status === 'accepted',
    ).length;
    const offers = liveJobs.filter((j) => j.status === 'offer' || j.status === 'accepted').length;

    const gaps = liveJobs
      .filter((j) => j.applicationDate && j.interviewDate)
      .map((j) => {
        const applied = parseISO(j.applicationDate!);
        const interview = parseISO(j.interviewDate!);
        return Math.round((interview.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24));
      })
      .filter((d) => d >= 0);
    const avgDaysToInterview = gaps.length
      ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
      : null;

    return {
      total,
      interviewRate: applied > 0 ? Math.round((interviewed / applied) * 100) : 0,
      offerRate: applied > 0 ? Math.round((offers / applied) * 100) : 0,
      avgDaysToInterview,
    };
  }, [liveJobs]);

  const tiles = [
    { label: 'Total applications', value: stats.total, icon: Briefcase, tone: 'text-brass', bg: 'bg-brass/10' },
    { label: 'Interview rate', value: `${stats.interviewRate}%`, icon: Percent, tone: 'text-forest', bg: 'bg-forest/10' },
    { label: 'Offer rate', value: `${stats.offerRate}%`, icon: BarChart3, tone: 'text-brick', bg: 'bg-brick/10' },
    {
      label: 'Avg. days to interview',
      value: stats.avgDaysToInterview === null ? '—' : stats.avgDaysToInterview,
      icon: Timer,
      tone: 'text-slate',
      bg: 'bg-slate/10',
    },
    {
      label: 'Median days to first response',
      value: overallMedianResponseDays === null ? '—' : overallMedianResponseDays,
      icon: Hourglass,
      tone: 'text-brass',
      bg: 'bg-brass/10',
    },
  ];

  if (liveJobs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <BarChart3 className="h-8 w-8 text-ink-faint" strokeWidth={1.5} />
        <p className="font-display text-lg font-semibold">Nothing to chart yet</p>
        <p className="max-w-xs text-sm text-ink-faint">
          Add a few applications on The Board and your pipeline, trend, and breakdown charts will show up
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-6 pb-8 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-ink-faint">How your job search is trending</p>
        </div>
        <button
          onClick={handleDownloadReport}
          disabled={isExporting}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink/10 px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
        >
          <FileDown className="h-3.5 w-3.5" />
          {isExporting ? 'Generating…' : 'Download report'}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map(({ label, value, icon: Icon, tone, bg }) => (
          <div
            key={label}
            className="rounded-lg border border-ink/10 bg-white p-4 shadow-card dark:border-white/10 dark:bg-night-panel"
          >
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-md', bg)}>
              <Icon className={cn('h-4.5 w-4.5', tone)} />
            </div>
            <div className="mt-3 font-display text-3xl font-semibold">{value}</div>
            <div className="text-xs text-ink-faint">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">Pipeline</h2>
          <p className="text-xs text-ink-faint">Applications currently in each stage</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,138,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: COLORS.inkFaint }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.inkFaint }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(30,58,138,0.1)' }}
                />
                <Bar dataKey="count" fill={COLORS.brass} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">Applications over time</h2>
          <p className="text-xs text-ink-faint">New applications by month, last 6 months</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,138,0.08)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: COLORS.inkFaint }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.inkFaint }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(30,58,138,0.1)' }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={COLORS.forest}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLORS.forest }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {workModeData.length > 0 && (
          <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
            <h2 className="font-display text-lg font-semibold">Work mode</h2>
            <p className="text-xs text-ink-faint">Remote vs. hybrid vs. onsite</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={workModeData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                    {workModeData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(30,58,138,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {employmentTypeData.length > 0 && (
          <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
            <h2 className="font-display text-lg font-semibold">Employment type</h2>
            <p className="text-xs text-ink-faint">What kind of roles you're applying to</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={employmentTypeData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                    {employmentTypeData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(30,58,138,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {sourceData.length > 0 && (
          <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
            <h2 className="font-display text-lg font-semibold">Where applications came from</h2>
            <p className="text-xs text-ink-faint">Source breakdown across your applications</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(30,58,138,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {responseStats.length > 0 && (
        <div className="mt-4 rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">Response time by source</h2>
          <p className="text-xs text-ink-faint">
            Median days from applying to first response (interview or rejection) - jobs still waiting on a
            reply aren't counted yet
          </p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={responseStats} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,138,0.08)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.inkFaint }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  tick={{ fontSize: 11, fill: COLORS.inkFaint }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(30,58,138,0.1)' }}
                  formatter={(value: number, _name, item) => [
                    `${value} day${value === 1 ? '' : 's'} (${item.payload.count} job${item.payload.count === 1 ? '' : 's'})`,
                    'Median',
                  ]}
                />
                <Bar dataKey="medianDays" fill={COLORS.brassSoft} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {resumeRows.length > 0 && (
        <div className="mt-4 rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">Resume performance</h2>
          <p className="text-xs text-ink-faint">
            Interview and offer rate by resume version - see Documents to upload more versions
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {resumeRows.map(({ doc, stats: r }) => (
              <div key={doc.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink dark:text-paper">{doc.name}</span>
                  <span className="shrink-0 font-mono text-xs text-ink-faint">
                    {r.applications} sent · {r.interviews} interview{r.interviews === 1 ? '' : 's'} · {r.offers}{' '}
                    offer{r.offers === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-ink/5 dark:bg-white/5">
                    <div
                      className="h-full bg-forest"
                      style={{ width: `${r.interviewRate}%` }}
                      title={`Interview rate: ${r.interviewRate}%`}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] text-forest">
                    {r.interviewRate}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-ink/5 dark:bg-white/5">
                    <div
                      className="h-full bg-brass"
                      style={{ width: `${r.offerRate}%` }}
                      title={`Offer rate: ${r.offerRate}%`}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] text-brass">{r.offerRate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
