import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Zap, CheckSquare, X, Archive, ArrowRightCircle, Trash2, ClipboardPaste } from 'lucide-react';
import { KANBAN_STATUSES, STATUS_LABELS, type KanbanStatus } from '@/types/models';
import { KanbanBoard } from '@/components/Kanban/KanbanBoard';
import { FilterBar } from '@/components/Kanban/FilterBar';
import { JobCaptureModal } from '@/components/JobForm/JobCaptureModal';
import { useDocketStore } from '@/store/useDocketStore';
import { useUIStore } from '@/store/useUIStore';
import { useToastStore } from '@/store/useToastStore';
import { cn } from '@/lib/utils';

export function KanbanPage() {
  const openJobModal = useUIStore((s) => s.openJobModal);
  const jobCount = useDocketStore((s) => s.jobs.filter((j) => j.status !== 'archived').length);
  const quickAddJob = useDocketStore((s) => s.quickAddJob);

  const selectMode = useUIStore((s) => s.selectMode);
  const setSelectMode = useUIStore((s) => s.setSelectMode);
  const selectedJobIds = useUIStore((s) => s.selectedJobIds);
  const clearSelection = useUIStore((s) => s.clearSelection);

  const [quickText, setQuickText] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickText.trim()) return;
    await quickAddJob(quickText, 'wishlist');
    setQuickText('');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-5 sm:px-6">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold sm:text-2xl">The Board</h1>
          <p className="truncate text-sm text-ink-faint">
            {jobCount} active application{jobCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => {
              if (selectMode) clearSelection();
              setSelectMode(!selectMode);
            }}
            aria-label={selectMode ? 'Cancel selection' : 'Select applications'}
            className={cn(
              'flex items-center gap-1.5 rounded-md border p-2 text-sm font-medium transition-colors sm:px-3.5 sm:py-2',
              selectMode
                ? 'border-brass bg-brass/10 text-brass-dim'
                : 'border-ink/10 text-ink-soft hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5',
            )}
          >
            {selectMode ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{selectMode ? 'Cancel' : 'Select'}</span>
          </button>
          <button
            onClick={() => setQuickOpen((v) => !v)}
            aria-label="Quick add"
            className="flex items-center gap-1.5 rounded-md border border-ink/10 p-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5 sm:px-3.5 sm:py-2"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Quick add</span>
          </button>
          <button
            onClick={() => setCaptureOpen(true)}
            aria-label="Paste to capture"
            className="flex items-center gap-1.5 rounded-md border border-ink/10 p-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5 sm:px-3.5 sm:py-2"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Paste to capture</span>
          </button>
          <button
            onClick={() => openJobModal('new')}
            aria-label="Add application"
            className="flex items-center gap-1.5 rounded-md bg-brass p-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] sm:px-4 sm:py-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add application</span>
          </button>
        </div>
      </div>

      <FilterBar />

      <AnimatePresence>
        {selectMode && selectedJobIds.size > 0 && <BulkActionBar />}
      </AnimatePresence>

      <AnimatePresence>
        {quickOpen && (
          <motion.form
            onSubmit={handleQuickAdd}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden px-6"
          >
            <input
              autoFocus
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder='Type "Position at Company" and hit enter — lands in Wishlist'
              className="input mt-3 font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuickOpen(false);
              }}
            />
          </motion.form>
        )}
      </AnimatePresence>

      <div className="min-h-0 flex-1">
        <KanbanBoard onOpenJob={(job) => openJobModal(job)} />
      </div>

      <AnimatePresence>
        {captureOpen && <JobCaptureModal onClose={() => setCaptureOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

// Floating toolbar shown once at least one card is selected. Reuses the
// existing single-job updateJob/deleteJobWithUndo actions in a loop
// rather than adding bulk-specific store methods — at personal-job-search
// scale (tens of cards, not thousands) the per-item sync/toast/timeline
// bookkeeping those already do is cheap enough to just repeat.
function BulkActionBar() {
  const selectedJobIds = useUIStore((s) => s.selectedJobIds);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const setSelectMode = useUIStore((s) => s.setSelectMode);
  const updateJob = useDocketStore((s) => s.updateJob);
  const deleteJobWithUndo = useDocketStore((s) => s.deleteJobWithUndo);
  const jobs = useDocketStore((s) => s.jobs);

  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = selectedJobIds.size;

  async function applyToSelected(fn: (id: string) => Promise<void>) {
    setBusy(true);
    try {
      await Promise.all([...selectedJobIds].map(fn));
    } finally {
      setBusy(false);
      clearSelection();
      setSelectMode(false);
    }
  }

  async function handleMoveTo(status: KanbanStatus) {
    setMoveOpen(false);
    const label = STATUS_LABELS[status];
    await applyToSelected((id) => updateJob(id, { status }));
    useToastStore.getState().push({
      message: `Moved ${count} application${count === 1 ? '' : 's'} to ${label}`,
      tone: 'success',
    });
  }

  async function handleArchive() {
    await applyToSelected((id) => updateJob(id, { status: 'archived' }));
    useToastStore.getState().push({
      message: `Archived ${count} application${count === 1 ? '' : 's'}`,
      tone: 'success',
    });
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${count} application${count === 1 ? '' : 's'}? This can be undone from each toast.`)) {
      return;
    }
    await applyToSelected((id) => deleteJobWithUndo(id));
  }

  const selectedJobs = jobs.filter((j) => selectedJobIds.has(j.id));

  return (
    <motion.div
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -12, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="mx-6 mt-3 flex items-center gap-3 rounded-md border border-brass/30 bg-brass/10 px-4 py-2.5"
    >
      <span className="text-sm font-semibold text-brass-dim">
        {count} selected
      </span>
      <div className="h-4 w-px bg-brass/30" />

      <div className="relative">
        <button
          disabled={busy}
          onClick={() => setMoveOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-white/60 disabled:opacity-50 dark:text-paper/70 dark:hover:bg-white/10"
        >
          <ArrowRightCircle className="h-3.5 w-3.5" />
          Move to…
        </button>
        <AnimatePresence>
          {moveOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-ink/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-night-panel"
            >
              {KANBAN_STATUSES.filter((s) => s !== 'archived').map((status) => (
                <button
                  key={status}
                  onClick={() => handleMoveTo(status)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        disabled={busy}
        onClick={handleArchive}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-white/60 disabled:opacity-50 dark:text-paper/70 dark:hover:bg-white/10"
      >
        <Archive className="h-3.5 w-3.5" />
        Archive
      </button>

      <button
        disabled={busy}
        onClick={handleDelete}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-brick transition-colors hover:bg-brick/10 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>

      <div className="ml-auto flex items-center gap-1 truncate text-xs text-ink-faint">
        {selectedJobs.slice(0, 2).map((j) => j.position).join(', ')}
        {selectedJobs.length > 2 ? ` +${selectedJobs.length - 2} more` : ''}
      </div>

      <button
        onClick={() => {
          clearSelection();
          setSelectMode(false);
        }}
        className="rounded p-1 text-ink-faint hover:bg-white/60 dark:hover:bg-white/10"
        title="Cancel selection"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
