import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { Job, Recruiter } from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { useUIStore } from '@/store/useUIStore';
import { RecruiterFormModal } from '@/components/RecruiterForm/RecruiterFormModal';
import { cn } from '@/lib/utils';

type EventKind = 'applied' | 'interview' | 'offer' | 'deadline' | 'followup';

interface CalEvent {
  id: string;
  date: string; // ISO
  label: string;
  kind: EventKind;
  job?: Job;
  recruiter?: Recruiter;
}

// Dot/chip colors per event kind, drawn from the existing palette rather
// than introducing new tokens.
const KIND_STYLES: Record<EventKind, { dot: string; chip: string }> = {
  applied: { dot: 'bg-slate', chip: 'bg-slate/10 text-slate' },
  interview: { dot: 'bg-brass', chip: 'bg-brass/10 text-brass-dim' },
  offer: { dot: 'bg-forest', chip: 'bg-forest/10 text-forest' },
  deadline: { dot: 'bg-brick', chip: 'bg-brick/10 text-brick' },
  followup: { dot: 'bg-brass-soft', chip: 'bg-brass/10 text-brass-dim' },
};

const KIND_LABELS: Record<EventKind, string> = {
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  deadline: 'Deadline',
  followup: 'Follow-up',
};

export function CalendarPage() {
  const jobs = useDocketStore((s) => s.jobs);
  const companies = useDocketStore((s) => s.companies);
  const recruiters = useDocketStore((s) => s.recruiters);
  const openJobModal = useUIStore((s) => s.openJobModal);

  const [cursor, setCursor] = useState(() => new Date());
  const [editingRecruiter, setEditingRecruiter] = useState<Recruiter | null | undefined>(undefined);

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? 'Unknown company';

  const events = useMemo(() => {
    const list: CalEvent[] = [];
    for (const job of jobs) {
      if (job.deletedAt) continue;
      const label = `${job.position} · ${companyName(job.companyId)}`;
      if (job.applicationDate) {
        list.push({ id: `${job.id}-applied`, date: job.applicationDate, label, kind: 'applied', job });
      }
      if (job.interviewDate) {
        list.push({ id: `${job.id}-interview`, date: job.interviewDate, label, kind: 'interview', job });
      }
      if (job.offerDate) {
        list.push({ id: `${job.id}-offer`, date: job.offerDate, label, kind: 'offer', job });
      }
      if (job.deadline) {
        list.push({ id: `${job.id}-deadline`, date: job.deadline, label, kind: 'deadline', job });
      }
    }
    for (const recruiter of recruiters) {
      if (recruiter.deletedAt || !recruiter.nextFollowUp) continue;
      list.push({
        id: `${recruiter.id}-followup`,
        date: recruiter.nextFollowUp,
        label: recruiter.name,
        kind: 'followup',
        recruiter,
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, recruiters, companies]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const evt of events) {
      const key = evt.date.slice(0, 10);
      const existing = map.get(key);
      if (existing) existing.push(evt);
      else map.set(key, [evt]);
    }
    return map;
  }, [events]);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const handleEventClick = (evt: CalEvent) => {
    if (evt.job) openJobModal(evt.job);
    else if (evt.recruiter) setEditingRecruiter(evt.recruiter);
  };

  return (
    <div className="flex h-full flex-col px-6 pb-6 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-ink-faint">Applications, interviews, deadlines and follow-ups</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCursor((d) => subMonths(d, 1))}
            className="rounded-md p-1.5 text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
          >
            Today
          </button>
          <button
            onClick={() => setCursor((d) => addMonths(d, 1))}
            className="rounded-md p-1.5 text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 min-w-[9rem] font-display text-lg font-semibold">
            {format(cursor, 'MMMM yyyy')}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
        {(Object.keys(KIND_LABELS) as EventKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', KIND_STYLES[k].dot)} />
            {KIND_LABELS[k]}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-ink/10 bg-ink/10 dark:border-white/10 dark:bg-white/10">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            className="bg-paper-dim px-2 py-1.5 text-center text-[11px] font-medium text-ink-faint dark:bg-night-panel"
          >
            {d}
          </div>
        ))}

        {gridDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, cursor);
          return (
            <div
              key={key}
              className={cn(
                'flex min-h-[92px] flex-col gap-1 bg-white p-1.5 dark:bg-night-panel',
                !inMonth && 'bg-paper-dim/60 dark:bg-night/60',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                  isToday(day)
                    ? 'bg-brass font-semibold text-white'
                    : inMonth
                      ? 'text-ink-soft dark:text-paper/70'
                      : 'text-ink-faint',
                )}
              >
                {format(day, 'd')}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((evt) => (
                  <button
                    key={evt.id}
                    onClick={() => handleEventClick(evt)}
                    title={`${KIND_LABELS[evt.kind]} · ${evt.label}`}
                    className={cn(
                      'truncate rounded px-1 py-0.5 text-left text-[10px] font-medium',
                      KIND_STYLES[evt.kind].chip,
                    )}
                  >
                    {evt.label}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="px-1 text-[10px] text-ink-faint">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {events.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <CalendarDays className="h-8 w-8 text-ink-faint" strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold">Nothing on the calendar yet</p>
          <p className="max-w-xs text-sm text-ink-faint">
            Dates you set on an application — applied, interview, offer, deadline — and recruiter
            follow-ups will show up here automatically.
          </p>
        </div>
      )}

      <AnimatePresence>
        {editingRecruiter !== undefined && editingRecruiter !== null && (
          <RecruiterFormModal recruiter={editingRecruiter} onClose={() => setEditingRecruiter(undefined)} />
        )}
      </AnimatePresence>
    </div>
  );
}
