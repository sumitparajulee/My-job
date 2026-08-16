import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X, Bookmark, BookmarkPlus, ChevronDown, Trash2 } from 'lucide-react';
import { useDocketStore } from '@/store/useDocketStore';
import { useFilterStore, isFilterEmpty } from '@/store/useFilterStore';
import { cn } from '@/lib/utils';

export function FilterBar() {
  const jobs = useDocketStore((s) => s.jobs);
  const filter = useFilterStore((s) => s.filter);
  const setFilter = useFilterStore((s) => s.setFilter);
  const clearFilter = useFilterStore((s) => s.clearFilter);
  const savedViews = useFilterStore((s) => s.savedViews);
  const activeViewId = useFilterStore((s) => s.activeViewId);
  const applyView = useFilterStore((s) => s.applyView);
  const saveCurrentAsView = useFilterStore((s) => s.saveCurrentAsView);
  const deleteView = useFilterStore((s) => s.deleteView);

  const [viewsOpen, setViewsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // All tags currently in use across active jobs, so the dropdown only
  // ever offers tags that could actually match something right now.
  const allTags = [...new Set(jobs.filter((j) => j.status !== 'archived').flatMap((j) => j.tags))].sort();
  const allSoftware = [
    ...new Set(jobs.filter((j) => j.status !== 'archived').flatMap((j) => j.software ?? [])),
  ].sort();

  const empty = isFilterEmpty(filter);
  const activeViewName = savedViews.find((v) => v.id === activeViewId)?.name;

  function handleSave() {
    if (!nameDraft.trim()) return;
    saveCurrentAsView(nameDraft);
    setNameDraft('');
    setViewsOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pt-3 sm:px-6">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
          placeholder="Search position or company..."
          className="input w-full pl-8 text-sm"
        />
      </div>

      <select
        value={filter.priority}
        onChange={(e) => setFilter({ priority: e.target.value as typeof filter.priority })}
        className="input w-auto text-sm"
      >
        <option value="all">Any priority</option>
        <option value="high">High priority</option>
        <option value="medium">Medium priority</option>
        <option value="low">Low priority</option>
      </select>

      {allTags.length > 0 && (
        <select
          value={filter.tag}
          onChange={(e) => setFilter({ tag: e.target.value })}
          className="input w-auto text-sm"
        >
          <option value="all">Any tag</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      )}

      {allSoftware.length > 0 && (
        <select
          value={filter.software}
          onChange={(e) => setFilter({ software: e.target.value })}
          className="input w-auto text-sm"
        >
          <option value="all">Any software</option>
          {allSoftware.map((sw) => (
            <option key={sw} value={sw}>
              {sw}
            </option>
          ))}
        </select>
      )}

      <button
        onClick={() => setFilter({ staleOnly: !filter.staleOnly })}
        className={cn(
          'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
          filter.staleOnly
            ? 'border-brass bg-brass/10 text-brass-dim'
            : 'border-ink/10 text-ink-soft hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5',
        )}
      >
        Gone quiet
      </button>

      {!empty && (
        <button
          onClick={clearFilter}
          className="flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium text-ink-faint hover:bg-ink/5 dark:hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}

      <div className="relative ml-auto">
        <button
          onClick={() => setViewsOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
            activeViewName
              ? 'border-brass bg-brass/10 text-brass-dim'
              : 'border-ink/10 text-ink-soft hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5',
          )}
        >
          <Bookmark className="h-3.5 w-3.5" />
          {activeViewName ?? 'Views'}
          <ChevronDown className="h-3 w-3" />
        </button>

        <AnimatePresence>
          {viewsOpen && (
            <>
              {/* Click-outside catcher */}
              <div className="fixed inset-0 z-10" onClick={() => setViewsOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-md border border-ink/10 bg-white shadow-lg dark:border-white/10 dark:bg-night-panel"
              >
                {savedViews.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-ink-faint">No saved views yet.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto py-1">
                    {savedViews.map((view) => (
                      <div
                        key={view.id}
                        className={cn(
                          'group flex items-center justify-between px-3 py-1.5 text-sm hover:bg-ink/5 dark:hover:bg-white/5',
                          view.id === activeViewId && 'bg-brass/5',
                        )}
                      >
                        <button
                          onClick={() => {
                            applyView(view.id);
                            setViewsOpen(false);
                          }}
                          className="min-w-0 flex-1 truncate text-left text-ink-soft dark:text-paper/70"
                        >
                          {view.name}
                        </button>
                        <button
                          onClick={() => deleteView(view.id)}
                          className="shrink-0 opacity-0 text-ink-faint hover:text-brick group-hover:opacity-100"
                          title="Delete view"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-ink/10 p-2 dark:border-white/10">
                  <div className="flex gap-1.5">
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder={empty ? 'Set a filter first...' : 'Name this view...'}
                      disabled={empty}
                      className="input flex-1 text-xs disabled:opacity-50"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave();
                      }}
                    />
                    <button
                      onClick={handleSave}
                      disabled={empty || !nameDraft.trim()}
                      title="Save current filter as a view"
                      className="flex shrink-0 items-center gap-1 rounded-md bg-brass px-2.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
