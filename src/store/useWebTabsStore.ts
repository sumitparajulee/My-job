// Persists the person's list of pasted-in web tabs (Zoho Mail calls
// this same idea "New Web Tab" — an arbitrary URL pinned into the
// sidebar and shown in an iframe). Plain localStorage, no sync backend,
// same reasoning as useUIStore: this is a personal layout preference,
// not job data, so it doesn't belong in the Firebase/Drive-synced
// dataset.

import { create } from 'zustand';

const LS_KEY = 'docket-web-tabs';

export interface WebTab {
  id: string;
  name: string;
  url: string;
}

function loadTabs(): WebTab[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt localStorage shouldn't crash the page — just start empty.
    return [];
  }
}

function saveTabs(tabs: WebTab[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(tabs));
}

interface WebTabsState {
  tabs: WebTab[];
  addTab: (name: string, url: string) => WebTab;
  removeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
}

// Accepts "gmail.com", "www.gmail.com", or a full "https://..." URL and
// normalizes to something fetch/iframe-safe. Returns null on anything
// that still isn't a usable http(s) URL after that — callers should
// treat null as "show a validation error," not proceed.
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const useWebTabsStore = create<WebTabsState>((set, get) => ({
  tabs: loadTabs(),

  addTab: (name, url) => {
    const tab: WebTab = { id: crypto.randomUUID(), name: name.trim() || url, url };
    const next = [...get().tabs, tab];
    set({ tabs: next });
    saveTabs(next);
    return tab;
  },

  removeTab: (id) => {
    const next = get().tabs.filter((t) => t.id !== id);
    set({ tabs: next });
    saveTabs(next);
  },

  renameTab: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = get().tabs.map((t) => (t.id === id ? { ...t, name: trimmed } : t));
    set({ tabs: next });
    saveTabs(next);
  },
}));
