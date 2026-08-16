import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Building2,
  MapPin,
  Clock,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Paperclip,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { KANBAN_STATUSES, STATUS_LABELS, type Job, type KanbanStatus } from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { useUIStore } from '@/store/useUIStore';
import { useToastStore } from '@/store/useToastStore';
import { cn, daysSince, formatDate, isStaleJob } from '@/lib/utils';

const BOARD_STATUSES: KanbanStatus[] = KANBAN_STATUSES.filter((s) => s !== 'archived');

const PRIORITY_DOT: Record<NonNullable<Job['priority']>, string> = {
  low: 'bg-slate',
  medium: 'bg-brass',
  high: 'bg-brick',
};

export function JobCard({ job, onOpen }: { job: Job; onOpen: (job: Job) => void }) {
  const company = useDocketStore((s) => s.companies.find((c) => c.id === job.companyId));
  const jobs = useDocketStore((s) => s.jobs);
  const moveJob = useDocketStore((s) => s.moveJob);
  const selectMode = useUIStore((s) => s.selectMode);
  const isSelected = useUIStore((s) => s.selectedJobIds.has(job.id));
  const toggleJobSelected = useUIStore((s) => s.toggleJobSelected);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: job.id,
    data: { type: 'job', job },
    // Dragging and bulk-select both use pointer-down on the card; letting
    // both stay live at once means a tap-to-select can get misread as the
    // start of a drag. Select mode wins while it's on.
    disabled: selectMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const age = daysSince(job.applicationDate ?? job.createdAt);
  const stale = isStaleJob(job);
  const daysIdle = daysSince(job.updatedAt);

  // Quick status move without drag — needed on mobile, where only one
  // column is visible at a time so you can't drag a card onto an
  // off-screen column. Moves to the immediately adjacent status and lands
  // at the end of that column.
  const statusIndex = BOARD_STATUSES.indexOf(job.status);
  const prevStatus = statusIndex > 0 ? BOARD_STATUSES[statusIndex - 1] : null;
  const nextStatus = statusIndex < BOARD_STATUSES.length - 1 ? BOARD_STATUSES[statusIndex + 1] : null;

  async function handleQuickMove(e: React.MouseEvent, target: typeof job.status | null) {
    e.stopPropagation();
    if (!target) return;
    const fromStatus = job.status;
    const targetCount = jobs.filter((j) => j.status === target).length;
    await moveJob(job.id, target, targetCount);
    window.dispatchEvent(new CustomEvent('docket:job-moved', { detail: target }));
    useToastStore.getState().push({
      message: `Moved "${job.position}" to ${STATUS_LABELS[target]}`,
      tone: 'success',
      duration: 4000,
      actionLabel: 'Undo',
      onAction: () => moveJob(job.id, fromStatus, job.order),
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(selectMode ? {} : attributes)}
      {...(selectMode ? {} : listeners)}
      onClick={() => (selectMode ? toggleJobSelected(job.id) : onOpen(job))}
      className={cn(
        'tab-notch group rounded-md border border-ink/10 bg-white px-3.5 py-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-night-panel',
        selectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
        stale && 'border-l-2 border-l-brass',
        isSelected && 'ring-2 ring-brass ring-offset-1 dark:ring-offset-night',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {selectMode && (
            <span className="mt-0.5 shrink-0 text-brass">
              {isSelected ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4 text-ink-faint" />}
            </span>
          )}
          <h3 className="min-w-0 truncate text-sm font-semibold leading-snug text-ink dark:text-paper">
            {job.position}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {job.jobUrl && (
            <a
              href={job.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              // Card drag listeners are on the outer div - stop the click
              // from starting a drag or bubbling up to onOpen so this
              // opens the posting instead of the edit modal.
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              title="Open job posting"
              className="rounded p-0.5 text-ink-faint opacity-100 transition-opacity hover:bg-ink/5 hover:text-brass dark:hover:bg-white/5 md:opacity-0 md:group-hover:opacity-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {stale && (
            <span title={`No activity in ${daysIdle}d - might be worth a follow-up`}>
              <AlertTriangle className="h-3 w-3 shrink-0 text-brass" />
            </span>
          )}
          {(job.resumeVersionId || job.coverLetterVersionId) && (
            <span title="Documents linked">
              <Paperclip className="h-3 w-3 shrink-0 text-ink-faint" />
            </span>
          )}
          {job.priority && (
            <span
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[job.priority])}
              title={`${job.priority} priority`}
            />
          )}
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1 text-xs text-ink-soft dark:text-paper/60">
        <Building2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{company?.name ?? 'Unknown company'}</span>
      </div>

      {job.location && (
        <div className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{job.location}</span>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-dashed border-ink/10 pt-2 font-mono text-[10px] text-ink-faint dark:border-white/10">
        <span>{job.applicationDate ? formatDate(job.applicationDate) : 'not applied'}</span>
        {age !== null && (
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {age}d
          </span>
        )}
      </div>

      {!selectMode && (prevStatus || nextStatus) && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-dashed border-ink/10 pt-2 dark:border-white/10 md:hidden">
          <button
            disabled={!prevStatus}
            onClick={(e) => handleQuickMove(e, prevStatus)}
            onPointerDown={(e) => e.stopPropagation()}
            title={prevStatus ? `Move to ${STATUS_LABELS[prevStatus]}` : undefined}
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium text-ink-faint transition-colors hover:bg-ink/5 disabled:opacity-30 dark:hover:bg-white/5"
          >
            <ChevronLeft className="h-3 w-3" />
            {prevStatus ? STATUS_LABELS[prevStatus] : ''}
          </button>
          <button
            disabled={!nextStatus}
            onClick={(e) => handleQuickMove(e, nextStatus)}
            onPointerDown={(e) => e.stopPropagation()}
            title={nextStatus ? `Move to ${STATUS_LABELS[nextStatus]}` : undefined}
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium text-ink-faint transition-colors hover:bg-ink/5 disabled:opacity-30 dark:hover:bg-white/5"
          >
            {nextStatus ? STATUS_LABELS[nextStatus] : ''}
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
