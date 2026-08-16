import { create } from 'zustand';
import { createCredential, verifyCredential, type StoredCredential } from '@/lib/crypto';

const STORAGE_KEY = 'docket-credential';
const SESSION_KEY = 'docket-unlocked';

function loadCredential(): StoredCredential | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCredential;
  } catch {
    return null;
  }
}

interface AuthState {
  hasPassword: boolean;
  isUnlocked: boolean;
  error: string | null;

  setup: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  changePassword: (current: string, next: string) => Promise<boolean>;
  removePassword: (current: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set) => ({
  hasPassword: loadCredential() !== null,
  // Unlocked persists per browser tab session (sessionStorage), not across
  // new sessions — a fresh tab/window always re-locks if a password is set.
  isUnlocked: loadCredential() === null || sessionStorage.getItem(SESSION_KEY) === '1',
  error: null,

  setup: async (password) => {
    const credential = await createCredential(password);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credential));
    sessionStorage.setItem(SESSION_KEY, '1');
    set({ hasPassword: true, isUnlocked: true, error: null });
  },

  unlock: async (password) => {
    const credential = loadCredential();
    if (!credential) {
      set({ isUnlocked: true });
      return true;
    }
    const ok = await verifyCredential(password, credential);
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, '1');
      set({ isUnlocked: true, error: null });
    } else {
      set({ error: 'Incorrect password' });
    }
    return ok;
  },

  lock: () => {
    sessionStorage.removeItem(SESSION_KEY);
    set({ isUnlocked: false });
  },

  changePassword: async (current, next) => {
    const credential = loadCredential();
    if (!credential) return false;
    const ok = await verifyCredential(current, credential);
    if (!ok) {
      set({ error: 'Current password is incorrect' });
      return false;
    }
    const newCredential = await createCredential(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newCredential));
    set({ error: null });
    return true;
  },

  removePassword: async (current) => {
    const credential = loadCredential();
    if (!credential) return true;
    const ok = await verifyCredential(current, credential);
    if (!ok) {
      set({ error: 'Current password is incorrect' });
      return false;
    }
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    set({ hasPassword: false, isUnlocked: true, error: null });
    return true;
  },
}));
