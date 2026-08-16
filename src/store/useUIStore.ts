import { create } from 'zustand';
import type { Job } from '@/types/models';

// Prefill data handed off from the quick-capture bookmarklet (see
// /public/capture-bookmarklet.js) via the /capture route's query
// params. Only ever consumed once — CapturePage sets it, JobFormModal
// reads it and clears it so a later "new job" doesn't reuse stale data.
export interface JobDraft {
  position?: string;
  companyName?: string;
  jobUrl?: string;
  location?: string;
}

interface UIState {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  jobModalTarget: Job | 'new' | null;
  openJobModal: (target: Job | 'new') => void;
  closeJobModal: () => void;

  captureDraft: JobDraft | null;
  setCaptureDraft: (draft: JobDraft | null) => void;

  // Mobile-only slide-in sidebar. Desktop ignores this (sidebar is always
  // visible via CSS breakpoint) — see Sidebar.tsx.
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Kanban bulk-select mode. Off by default so cards keep their normal
  // click-to-open / drag-to-move behavior; toggled on from the board
  // toolbar. selectedJobIds is cleared whenever selectMode turns off so
  // it can never go stale into the next session.
  selectMode: boolean;
  selectedJobIds: Set<string>;
  setSelectMode: (on: boolean) => void;
  toggleJobSelected: (id: string) => void;
  clearSelection: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  jobModalTarget: null,
  openJobModal: (target) => set({ jobModalTarget: target, commandPaletteOpen: false }),
  closeJobModal: () => set({ jobModalTarget: null }),

  captureDraft: null,
  setCaptureDraft: (draft) => set({ captureDraft: draft }),

  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  selectMode: false,
  selectedJobIds: new Set(),
  setSelectMode: (on) => set({ selectMode: on, selectedJobIds: on ? new Set() : new Set() }),
  toggleJobSelected: (id) =>
    set((s) => {
      const next = new Set(s.selectedJobIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedJobIds: next };
    }),
  clearSelection: () => set({ selectedJobIds: new Set() }),
}));
