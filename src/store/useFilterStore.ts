import { create } from 'zustand';
import type { Job, Priority } from '@/types/models';
import { isStaleJob } from '@/lib/utils';

// Board filtering + named saved views. Kept as its own store (rather than
// folded into useUIStore) since it has its own localStorage persistence
// and a distinct shape - filter criteria plus a list of saved presets -
// that doesn't fit useUIStore's transient-UI-toggle pattern.

export interface JobFilter {
  search: string;
  priority: Priority | 'all';
  tag: string | 'all';
  software: string | 'all';
  staleOnly: boolean;
}

export const EMPTY_FILTER: JobFilter = {
  search: '',
  priority: 'all',
  tag: 'all',
  software: 'all',
  staleOnly: false,
};

export function isFilterEmpty(f: JobFilter): boolean {
  return (
    f.search.trim() === '' &&
    f.priority === 'all' &&
    f.tag === 'all' &&
    f.software === 'all' &&
    !f.staleOnly
  );
}

export interface SavedView {
  id: string;
  name: string;
  filter: JobFilter;
  createdAt: string;
}

const LS_VIEWS_KEY = 'docket-saved-filter-views';

function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(LS_VIEWS_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

function persistViews(views: SavedView[]) {
  localStorage.setItem(LS_VIEWS_KEY, JSON.stringify(views));
}

interface FilterState {
  filter: JobFilter;
  savedViews: SavedView[];
  activeViewId: string | null; // null = an ad-hoc filter, not (or no longer) a saved view

  setFilter: (patch: Partial<JobFilter>) => void;
  clearFilter: () => void;
  saveCurrentAsView: (name: string) => void;
  applyView: (id: string) => void;
  deleteView: (id: string) => void;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  filter: EMPTY_FILTER,
  savedViews: loadViews(),
  activeViewId: null,

  setFilter: (patch) =>
    set((s) => ({ filter: { ...s.filter, ...patch }, activeViewId: null })),

  clearFilter: () => set({ filter: EMPTY_FILTER, activeViewId: null }),

  saveCurrentAsView: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const view: SavedView = {
      id: crypto.randomUUID(),
      name: trimmed,
      filter: get().filter,
      createdAt: new Date().toISOString(),
    };
    const next = [...get().savedViews, view];
    persistViews(next);
    set({ savedViews: next, activeViewId: view.id });
  },

  applyView: (id) => {
    const view = get().savedViews.find((v) => v.id === id);
    if (!view) return;
    set({ filter: view.filter, activeViewId: id });
  },

  deleteView: (id) => {
    const next = get().savedViews.filter((v) => v.id !== id);
    persistViews(next);
    set((s) => ({
      savedViews: next,
      activeViewId: s.activeViewId === id ? null : s.activeViewId,
    }));
  },
}));

// Applied per-card rather than per-column: the board still shows every
// status column, but a card that doesn't match the active filter is
// left out of its column entirely. companyName is passed in (rather than
// looked up here) since the caller already has it from the companies
// list and this keeps the store filter-only, with no store-to-store
// dependency.
export function jobMatchesFilter(job: Job, companyName: string, filter: JobFilter): boolean {
  if (filter.staleOnly && !isStaleJob(job)) return false;
  if (filter.priority !== 'all' && job.priority !== filter.priority) return false;
  if (filter.tag !== 'all' && !job.tags.includes(filter.tag)) return false;
  if (filter.software !== 'all' && !(job.software ?? []).includes(filter.software)) return false;
  if (filter.search.trim()) {
    const q = filter.search.trim().toLowerCase();
    const haystack = `${job.position} ${companyName}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}
