import { useMemo } from 'react';
import { Trophy, MapPin, CalendarClock, Star } from 'lucide-react';
import type { Company, Job } from '@/types/models';
import { useUIStore } from '@/store/useUIStore';
import { cn, parseSalaryToAnnual, formatDate } from '@/lib/utils';

const WORK_MODE_LABELS: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite' };
const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  casual: 'Casual',
};

// Shown once someone has 2+ active offers (status offer or accepted) - a
// side-by-side view so a decision doesn't have to be pieced together by
// clicking between separate job cards. Salary is parsed best-effort (see
// parseSalaryToAnnual) purely to highlight the top figure; the raw text
// is always shown alongside it since the parse can be wrong.
export function OfferComparison({
  jobs,
  companies,
}: {
  jobs: Job[];
  companies: Company[];
}) {
  const openJobModal = useUIStore((s) => s.openJobModal);

  const offers = useMemo(
    () =>
      jobs
        .filter((j) => !j.deletedAt && !j.archivedAt && (j.status === 'offer' || j.status === 'accepted'))
        .map((job) => ({
          job,
          company: companies.find((c) => c.id === job.companyId)?.name ?? 'Unknown company',
          parsedSalary: parseSalaryToAnnual(job.salary),
        }))
        .sort((a, b) => (b.parsedSalary ?? -1) - (a.parsedSalary ?? -1)),
    [jobs, companies],
  );

  if (offers.length < 2) return null;

  const topSalary = offers[0].parsedSalary;

  return (
    <div className="mt-5 rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
      <div className="flex items-center gap-1.5">
        <Trophy className="h-4 w-4 text-brass" />
        <h2 className="font-display text-lg font-semibold">Comparing your offers</h2>
      </div>
      <p className="text-xs text-ink-faint">
        {offers.length} active offer{offers.length === 1 ? '' : 's'} - salary estimate is a best-effort parse
        of what you typed, not guaranteed accurate
      </p>

      <div className="mt-4 -mx-5 overflow-x-auto px-5">
        <div className="flex gap-3" style={{ minWidth: offers.length > 2 ? `${offers.length * 220}px` : undefined }}>
          {offers.map(({ job, company, parsedSalary }) => {
            const isTop = parsedSalary !== null && parsedSalary === topSalary;
            return (
              <button
                key={job.id}
                onClick={() => openJobModal(job)}
                className={cn(
                  'flex w-56 shrink-0 flex-col gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-ink/5 dark:hover:bg-white/5',
                  isTop ? 'border-brass/40 bg-brass/5' : 'border-ink/10 dark:border-white/10',
                )}
              >
                <div>
                  <div className="truncate font-display text-sm font-semibold">{job.position}</div>
                  <div className="truncate text-xs text-ink-faint">{company}</div>
                </div>

                <div className="flex items-center gap-1.5">
                  {isTop && <Trophy className="h-3.5 w-3.5 shrink-0 text-brass" />}
                  <span className="text-sm font-semibold text-ink dark:text-paper">
                    {job.salary || '—'}
                  </span>
                </div>
                {parsedSalary !== null && (
                  <div className="text-[11px] text-ink-faint">
                    ≈ ${parsedSalary.toLocaleString()}/yr estimate
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 text-[11px] text-ink-faint">
                  {job.workMode && (
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 dark:bg-white/5">
                      {WORK_MODE_LABELS[job.workMode] ?? job.workMode}
                    </span>
                  )}
                  {job.employmentType && (
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 dark:bg-white/5">
                      {EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType}
                    </span>
                  )}
                </div>

                {job.location && (
                  <div className="flex items-center gap-1 text-[11px] text-ink-faint">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{job.location}</span>
                  </div>
                )}

                {job.deadline && (
                  <div className="flex items-center gap-1 text-[11px] text-ink-faint">
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    Respond by {formatDate(job.deadline)}
                  </div>
                )}

                {job.rating && (
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn('h-3 w-3', n <= job.rating! ? 'fill-brass text-brass' : 'text-ink-faint')}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
