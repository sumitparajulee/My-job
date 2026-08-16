import { create } from 'zustand';
import type { ConnectionStatus, PresenceUser } from '@/lib/syncEngine';

interface SyncState {
  enabled: boolean; // is sync configured at all (Supabase env vars present)
  status: ConnectionStatus;
  presence: PresenceUser[];
  setStatus: (status: ConnectionStatus) => void;
  setPresence: (users: PresenceUser[]) => void;
  setEnabled: (enabled: boolean) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  enabled: false,
  status: 'offline',
  presence: [],
  setStatus: (status) => set({ status }),
  setPresence: (presence) => set({ presence }),
  setEnabled: (enabled) => set({ enabled }),
}));
