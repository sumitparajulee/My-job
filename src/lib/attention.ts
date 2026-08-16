import type { Company, Job, Recruiter } from '@/types/models';
import { isStaleJob, daysSince } from './utils';

export type AttentionKind = 'interview_today' | 'deadline_today' | 'followup_due' | 'stale';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  jobId?: string;
  recruiterId?: string;
  title: string;
  subtitle: string;
  sortDate: string; // ISO — used to order the list within its kind bucket
}

const KIND_PRIORITY: Record<AttentionKind, number> = {
  interview_today: 0,
  deadline_today: 1,
  followup_due: 2,
  stale: 3,
};

// Everything that needs a human to look at it: today's interviews and
// deadlines, recruiter follow-ups that are due or overdue, and jobs that
// have gone quiet in an active-pursuit stage (see isStaleJob). Sorted by
// urgency bucket first, then by date within that bucket, so the top of the
// list is always the single most pressing thing.
export function getAttentionItems(jobs: Job[], recruiters: Recruiter[], companies: Company[]): AttentionItem[] {
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? 'Unknown company';
  const today = new Date().toISOString().slice(0, 10);
  const items: AttentionItem[] = [];

  for (const job of jobs) {
    if (job.deletedAt || job.archivedAt) continue;

    if (job.interviewDate?.slice(0, 10) === today) {
      items.push({
        id: `interview-${job.id}`,
        kind: 'interview_today',
        jobId: job.id,
        title: `Interview today — ${job.position}`,
        subtitle: companyName(job.companyId),
        sortDate: job.interviewDate,
      });
    }

    if (job.deadline?.slice(0, 10) === today) {
      items.push({
        id: `deadline-${job.id}`,
        kind: 'deadline_today',
        jobId: job.id,
        title: `Deadline today — ${job.position}`,
        subtitle: companyName(job.companyId),
        sortDate: job.deadline,
      });
    }

    if (isStaleJob(job)) {
      const days = daysSince(job.updatedAt);
      items.push({
        id: `stale-${job.id}`,
        kind: 'stale',
        jobId: job.id,
        title: `Gone quiet — ${job.position}`,
        subtitle: `${companyName(job.companyId)} · no movement in ${days} day${days === 1 ? '' : 's'}`,
        sortDate: job.updatedAt,
      });
    }
  }

  for (const r of recruiters) {
    if (r.deletedAt || !r.nextFollowUp) continue;
    const dueDate = r.nextFollowUp.slice(0, 10);
    if (dueDate > today) continue;
    items.push({
      id: `followup-${r.id}`,
      kind: 'followup_due',
      recruiterId: r.id,
      title: `Follow up with ${r.name}`,
      subtitle: dueDate < today ? 'Overdue' : 'Due today',
      sortDate: r.nextFollowUp,
    });
  }

  return items.sort(
    (a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.sortDate.localeCompare(b.sortDate),
  );
}
