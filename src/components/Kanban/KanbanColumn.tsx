import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Job, KanbanStatus } from '@/types/models';
import { STATUS_LABELS } from '@/types/models';
import { JobCard } from './JobCard';

export function KanbanColumn({
  status,
  jobs,
  onOpenJob,
}: {
  status: KanbanStatus;
  jobs: Job[];
  onOpenJob: (job: Job) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { type: 'column', status } });
  const sorted = [...jobs].sort((a, b) => a.order - b.order);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="tab-notch mb-2 flex items-center justify-between bg-ink/5 px-3 py-2 dark:bg-white/5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft dark:text-paper/70">
          {STATUS_LABELS[status]}
        </span>
        <span className="font-mono text-[10px] text-ink-faint">{jobs.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex min-h-[120px] flex-1 flex-col gap-2 rounded-md p-1 transition-colors ${
          isOver ? 'bg-brass/8' : ''
        }`}
      >
        <SortableContext items={sorted.map((j) => j.id)} strategy={verticalListSortingStrategy}>
          {sorted.map((job) => (
            <JobCard key={job.id} job={job} onOpen={onOpenJob} />
          ))}
        </SortableContext>
        {sorted.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-ink/10 py-6 text-center text-[11px] text-ink-faint dark:border-white/10">
            Drop a job here
          </div>
        )}
      </div>
    </div>
  );
}
