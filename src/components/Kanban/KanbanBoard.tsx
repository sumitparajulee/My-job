import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { KANBAN_STATUSES, STATUS_LABELS, type Job, type KanbanStatus } from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { useToastStore } from '@/store/useToastStore';
import { useFilterStore, jobMatchesFilter } from '@/store/useFilterStore';
import { KanbanColumn } from './KanbanColumn';
import { JobCard } from './JobCard';
import { cn } from '@/lib/utils';

const BOARD_STATUSES = KANBAN_STATUSES.filter((s) => s !== 'archived');

export function KanbanBoard({ onOpenJob }: { onOpenJob: (job: Job) => void }) {
  const jobs = useDocketStore((s) => s.jobs);
  const companies = useDocketStore((s) => s.companies);
  const moveJob = useDocketStore((s) => s.moveJob);
  const reorderWithinColumn = useDocketStore((s) => s.reorderWithinColumn);
  const filter = useFilterStore((s) => s.filter);
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '';
  const visibleJobs = jobs
    .filter((j) => j.status !== 'archived')
    .filter((j) => jobMatchesFilter(j, companyName(j.companyId), filter));
  const isStatus = (id: string): id is KanbanStatus =>
    (KANBAN_STATUSES as readonly string[]).includes(id);

  // Mobile view shows one column at a time (swipe to move between them)
  // instead of the desktop side-scrolling multi-column board — dragging a
  // card between columns that are off-screen doesn't work on a phone, and
  // ten 288px-wide columns side by side are unusable at phone width.
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeStatus, setActiveStatus] = useState<KanbanStatus>(BOARD_STATUSES[0]);
  const scrollingFromTap = useRef(false);

  function scrollToStatus(status: KanbanStatus) {
    const el = columnRefs.current[status];
    const container = scrollRef.current;
    if (!el || !container) return;
    scrollingFromTap.current = true;
    container.scrollTo({ left: el.offsetLeft - container.offsetLeft, behavior: 'smooth' });
    setActiveStatus(status);
    window.setTimeout(() => {
      scrollingFromTap.current = false;
    }, 400);
  }

  function handleScroll() {
    if (scrollingFromTap.current) return;
    const container = scrollRef.current;
    if (!container) return;
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    let closest: KanbanStatus = activeStatus;
    let closestDist = Infinity;
    for (const status of BOARD_STATUSES) {
      const el = columnRefs.current[status];
      if (!el) continue;
      const center = el.offsetLeft - container.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(center - containerCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = status;
      }
    }
    if (closest !== activeStatus) setActiveStatus(closest);
  }

  // Jump the mobile scroller to a status column whenever a job lands there
  // from the quick move-status buttons on a card, so the change is visible
  // without the user needing to manually swipe over.
  useEffect(() => {
    const handler = (e: Event) => {
      const status = (e as CustomEvent<KanbanStatus>).detail;
      if (status) scrollToStatus(status);
    };
    window.addEventListener('docket:job-moved', handler);
    return () => window.removeEventListener('docket:job-moved', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDragStart(event: DragStartEvent) {
    const job = jobs.find((j) => j.id === event.active.id);
    setActiveJob(job ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveJob(null);
    const { active, over } = event;
    if (!over) return;

    const job = jobs.find((j) => j.id === active.id);
    if (!job) return;

    const overId = String(over.id);
    const targetStatus: KanbanStatus = isStatus(overId)
      ? overId
      : jobs.find((j) => j.id === overId)?.status ?? job.status;

    const columnJobs = jobs
      .filter((j) => j.status === targetStatus && j.id !== job.id)
      .sort((a, b) => a.order - b.order);

    const foundIndex = isStatus(overId) ? -1 : columnJobs.findIndex((j) => j.id === overId);
    const overIndex = foundIndex === -1 ? columnJobs.length : foundIndex;

    const reordered = [...columnJobs];
    reordered.splice(overIndex, 0, job);

    if (targetStatus !== job.status) {
      const fromStatus = job.status;
      await moveJob(job.id, targetStatus, overIndex);
      useToastStore.getState().push({
        message: `Moved "${job.position}" to ${STATUS_LABELS[targetStatus]}`,
        tone: 'success',
        duration: 4000,
        actionLabel: 'Undo',
        onAction: () => moveJob(job.id, fromStatus, job.order),
      });
    }
    await reorderWithinColumn(
      targetStatus,
      reordered.map((j) => j.id),
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Status tabs — mobile only. Lets you jump to a column instead of
          hunting for it in the side-scroller, and shows where you are. */}
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 pt-1 md:hidden">
        {BOARD_STATUSES.map((status) => {
          const count = visibleJobs.filter((j) => j.status === status).length;
          return (
            <button
              key={status}
              onClick={() => scrollToStatus(status)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                activeStatus === status
                  ? 'border-brass bg-brass text-white shadow-stamp'
                  : 'border-ink/10 text-ink-soft dark:border-white/10 dark:text-paper/70',
              )}
            >
              {STATUS_LABELS[status]}
              <span
                className={cn(
                  'ml-1.5 font-mono text-[10px]',
                  activeStatus === status ? 'text-white/80' : 'text-ink-faint',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex h-full snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-3 pb-6 md:snap-none md:gap-4 md:px-6"
      >
        {BOARD_STATUSES.map((status, i) => (
          <motion.div
            key={status}
            ref={(el) => {
              columnRefs.current[status] = el;
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.03 }}
            className="w-full shrink-0 snap-center md:w-72 md:shrink-0"
          >
            <KanbanColumn
              status={status}
              jobs={visibleJobs.filter((j) => j.status === status)}
              onOpenJob={onOpenJob}
            />
          </motion.div>
        ))}
      </div>
      <DragOverlay>{activeJob ? <JobCard job={activeJob} onOpen={() => {}} /> : null}</DragOverlay>
    </DndContext>
  );
}
