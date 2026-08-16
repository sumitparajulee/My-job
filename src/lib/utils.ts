export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// Statuses where "no movement" is actually a signal worth flagging.
// Wishlist/Ready are pre-application idle-by-design; Offer/Accepted/
// Rejected/Archived are end states — none of those should nag.
const STALE_ELIGIBLE_STATUSES: readonly string[] = [
  'applied',
  'assessment',
  'interview',
  'reference_check',
];

export const STALE_THRESHOLD_DAYS = 14;

// A job counts as stale if it's sitting in an active-pursuit stage and
// hasn't had *any* recorded change — status move, edit, or manual
// timeline note — in STALE_THRESHOLD_DAYS. updatedAt is the right field
// for this (not applicationDate): it reflects the last time anything
// happened on the card, which is what "gone quiet" actually means.
export function isStaleJob(job: { status: string; updatedAt: string }): boolean {
  if (!STALE_ELIGIBLE_STATUSES.includes(job.status)) return false;
  const days = daysSince(job.updatedAt);
  return days !== null && days >= STALE_THRESHOLD_DAYS;
}

// Count of things that need a human to actually do something today:
// a deadline or interview landing today, or a recruiter follow-up that's
// due or overdue. Mirrors the criteria behind Dashboard's "Today's tasks"
// widget, but kept as a standalone, cheap function (no timeline/company
// lookups) so it can run on every store change to drive the app icon
// badge and the nav dots — those need to update the instant a job or
// recruiter changes, not just when the Dashboard page happens to be open.
export function getAttentionCount(
  jobs: Array<{ archivedAt?: string | null; deadline?: string | null; interviewDate?: string | null }>,
  recruiters: Array<{ deletedAt?: string | null; nextFollowUp?: string | null }>,
): number {
  const todayIso = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const job of jobs) {
    if (job.archivedAt) continue;
    if (job.deadline?.slice(0, 10) === todayIso) count++;
    if (job.interviewDate?.slice(0, 10) === todayIso) count++;
  }
  for (const r of recruiters) {
    if (r.deletedAt || !r.nextFollowUp) continue;
    if (r.nextFollowUp.slice(0, 10) <= todayIso) count++;
  }
  return count;
}

// ----------------------------------------------------------------------------
// Conversion funnel — how far applications get before dropping off, not just
// the current snapshot. A job's *current* status alone can't answer this: a
// rejected job's status is 'rejected', which says nothing about whether it
// died at Applied or after three interview rounds. So "how far did this job
// get" is reconstructed from three sources, in order of reliability:
//   1. Timeline events ("Moved to Interview") — exact history, once present
//   2. Date fields (interviewDate, offerDate) as corroborating evidence
//   3. Current status, if it's itself a funnel stage
// and the furthest stage found wins. Pre-application stages (wishlist,
// ready) and terminal non-outcomes (rejected, archived) are deliberately
// left out of FUNNEL_STAGES — they're not points of progress, so 'rejected'
// must never be treated as "further along" than 'interview'.
// ----------------------------------------------------------------------------
export const FUNNEL_STAGES = [
  'applied',
  'assessment',
  'interview',
  'reference_check',
  'offer',
  'accepted',
] as const;

export interface FunnelJobLike {
  status: string;
  applicationDate?: string;
  interviewDate?: string;
  offerDate?: string;
}

export interface FunnelEventLike {
  label: string;
}

// statusLabels maps a KanbanStatus to its display label (e.g. STATUS_LABELS)
// — passed in rather than imported, so this stays a plain data function
// with no dependency on the app's type module.
// ----------------------------------------------------------------------------
// Salary parsing — best-effort only. Salary is free text ("$120k-$140k",
// "150000", "$95/hr"), not a structured field, so this pulls out numbers,
// expands "k" shorthand, and averages a range. Returns null rather than
// guessing when nothing numeric is found - a comparison showing a wrong
// number is worse than one showing "—". Numbers under 300 are treated as
// an hourly rate and scaled to a rough full-time annual figure (2080
// hrs/yr) purely so they land in the same ballpark as salaries typed
// directly - not a precise conversion.
// ----------------------------------------------------------------------------
export function parseSalaryToAnnual(raw?: string): number | null {
  if (!raw) return null;
  const matches = raw.match(/[\d,.]+\s*k?/gi);
  if (!matches) return null;
  const nums = matches
    .map((m) => {
      const isK = /k$/i.test(m.trim());
      const n = parseFloat(m.replace(/[^\d.]/g, ''));
      if (Number.isNaN(n) || n <= 0) return null;
      return isK ? n * 1000 : n;
    })
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.round(avg < 300 ? avg * 2080 : avg);
}

export function furthestFunnelStage(
  job: FunnelJobLike,
  events: FunnelEventLike[],
  statusLabels: Record<string, string>,
): number {
  const indices: number[] = [];

  const statusIdx = FUNNEL_STAGES.indexOf(job.status as (typeof FUNNEL_STAGES)[number]);
  if (statusIdx !== -1) indices.push(statusIdx);

  for (const event of events) {
    const match = /^(?:Added to|Moved to) (.+)$/.exec(event.label);
    if (!match) continue;
    const status = Object.keys(statusLabels).find((s) => statusLabels[s] === match[1]);
    const idx = status ? FUNNEL_STAGES.indexOf(status as (typeof FUNNEL_STAGES)[number]) : -1;
    if (idx !== -1) indices.push(idx);
  }

  if (job.applicationDate) indices.push(FUNNEL_STAGES.indexOf('applied'));
  if (job.interviewDate) indices.push(FUNNEL_STAGES.indexOf('interview'));
  if (job.offerDate) indices.push(FUNNEL_STAGES.indexOf('offer'));

  return indices.length ? Math.max(...indices) : -1;
}

export interface FunnelStageResult {
  stage: (typeof FUNNEL_STAGES)[number];
  label: string;
  count: number;
  conversionFromPrev: number | null; // % of previous stage's count, null for the first stage
}

// ----------------------------------------------------------------------------
// Resume version performance — success rates grouped by which resume
// document (DocketDocument.id) a job was linked to via resumeVersionId.
// Jobs with no resume linked are excluded entirely rather than bucketed
// under some fake "none" id, since that number wouldn't correspond to
// any resume a person could act on.
// ----------------------------------------------------------------------------
const RESUME_INTERVIEWED_STATUSES: readonly string[] = [
  'interview',
  'reference_check',
  'offer',
  'accepted',
];
const RESUME_OFFERED_STATUSES: readonly string[] = ['offer', 'accepted'];

export interface ResumeVersionJobLike {
  resumeVersionId?: string;
  status: string;
}

export interface ResumeVersionStats {
  documentId: string;
  applications: number;
  interviews: number;
  offers: number;
  interviewRate: number;
  offerRate: number;
}

export function computeResumeStats<T extends ResumeVersionJobLike>(
  jobs: T[],
): Map<string, ResumeVersionStats> {
  const byDoc = new Map<string, { applications: number; interviews: number; offers: number }>();

  for (const job of jobs) {
    if (!job.resumeVersionId) continue;
    const bucket = byDoc.get(job.resumeVersionId) ?? { applications: 0, interviews: 0, offers: 0 };
    bucket.applications += 1;
    if (RESUME_INTERVIEWED_STATUSES.includes(job.status)) bucket.interviews += 1;
    if (RESUME_OFFERED_STATUSES.includes(job.status)) bucket.offers += 1;
    byDoc.set(job.resumeVersionId, bucket);
  }

  const result = new Map<string, ResumeVersionStats>();
  for (const [documentId, bucket] of byDoc) {
    result.set(documentId, {
      documentId,
      ...bucket,
      interviewRate: bucket.applications > 0 ? Math.round((bucket.interviews / bucket.applications) * 100) : 0,
      offerRate: bucket.applications > 0 ? Math.round((bucket.offers / bucket.applications) * 100) : 0,
    });
  }
  return result;
}

// ----------------------------------------------------------------------------
// Response time — how long a job sat at "Applied" before anything happened,
// broken down by where the application came from. A job's first response
// is the earliest "Moved to X" timeline event after applicationDate where X
// isn't Applied itself - that covers both a forward move (Assessment,
// Interview...) and a rejection, since both are a business actually
// responding. A job with no such event yet (still silently sitting at
// Applied) is excluded rather than counted as "0 days" or "infinite" -
// there's no response to measure yet.
// ----------------------------------------------------------------------------
export interface ResponseTimeJobLike {
  id: string;
  source?: string;
  applicationDate?: string;
}

export interface ResponseTimeEventLike {
  label: string;
  date: string;
}

export interface ResponseTimeStat {
  key: string; // ApplicationSource, or 'unknown' if not set
  count: number;
  medianDays: number;
  avgDays: number;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

export function computeResponseTimeBySource<T extends ResponseTimeJobLike>(
  jobs: T[],
  eventsByJob: Map<string, ResponseTimeEventLike[]>,
): Map<string, ResponseTimeStat> {
  const daysByKey = new Map<string, number[]>();

  for (const job of jobs) {
    if (!job.applicationDate) continue;
    const appliedTime = new Date(job.applicationDate).getTime();
    if (Number.isNaN(appliedTime)) continue;

    const responseTime = (eventsByJob.get(job.id) ?? [])
      .filter((e) => /^Moved to /.test(e.label) && !e.label.includes('Applied'))
      .map((e) => new Date(e.date).getTime())
      .filter((t) => !Number.isNaN(t) && t >= appliedTime)
      .sort((a, b) => a - b)[0];

    if (responseTime === undefined) continue;

    const days = Math.round((responseTime - appliedTime) / (1000 * 60 * 60 * 24));
    const key = job.source ?? 'unknown';
    const arr = daysByKey.get(key) ?? [];
    arr.push(days);
    daysByKey.set(key, arr);
  }

  const result = new Map<string, ResponseTimeStat>();
  for (const [key, days] of daysByKey) {
    const sorted = [...days].sort((a, b) => a - b);
    result.set(key, {
      key,
      count: days.length,
      medianDays: median(sorted),
      avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    });
  }
  return result;
}

export function computeFunnel(
  jobs: FunnelJobLike[],
  eventsByJob: Map<string, FunnelEventLike[]> | ((job: FunnelJobLike) => FunnelEventLike[]),
  statusLabels: Record<string, string>,
  jobKey?: (job: FunnelJobLike) => string,
): FunnelStageResult[] {
  const getEvents = (job: FunnelJobLike): FunnelEventLike[] => {
    if (typeof eventsByJob === 'function') return eventsByJob(job);
    const key = jobKey ? jobKey(job) : '';
    return eventsByJob.get(key) ?? [];
  };

  const furthest = jobs.map((j) => furthestFunnelStage(j, getEvents(j), statusLabels));

  let prevCount: number | null = null;
  return FUNNEL_STAGES.map((stage, idx) => {
    const count = furthest.filter((f) => f >= idx).length;
    const conversionFromPrev = prevCount === null || prevCount === 0 ? null : Math.round((count / prevCount) * 100);
    prevCount = count;
    return { stage, label: statusLabels[stage] ?? stage, count, conversionFromPrev };
  });
}
