import { create } from 'zustand';
import {
  collection,
  doc,
  getDoc,
  runTransaction,
} from 'firebase/firestore';
import { dbFirestore, isSyncConfigured } from '@/lib/firebase';
import {
  getCurrentUser,
  isAllowedEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  subscribeToAuthUser,
} from '@/lib/identity';

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  displayName: string;
  color: string;
  role: 'owner' | 'member';
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  inviteCode: string;
}

const LAST_WORKSPACE_KEY = 'docket-last-workspace';
const DEFAULT_DISPLAY_NAME = 'Sumit';

function randomInviteCode(): string {
  return Math.random().toString(36).slice(2, 8);
}

const PALETTE = ['#c05746', '#4a7c59', '#3d5a80', '#a06cd5', '#e09f3e', '#5e6472'];
function colorFor(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) hash = (hash * 31 + clientId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// This workspace has exactly one allowed member (see ALLOWED_EMAILS in
// identity.ts), but the pointer-doc bootstrap logic is kept as-is rather
// than simplified to "just use this uid" — it still correctly handles
// the one real multi-device case that matters here: the same Google
// account signing in from a second device gets its own Firebase uid on
// the *first* sign-in from that device history, so this still needs to
// resolve to the one existing workspace rather than create a second one.
async function ensureWorkspaceForUser(
  uid: string,
  displayName: string,
): Promise<string> {
  if (!dbFirestore) throw new Error('Firestore is not configured');
  const db = dbFirestore;

  const userWorkspaceRef = doc(db, 'userWorkspaces', uid);
  const primaryPointerRef = doc(db, 'meta', 'primaryWorkspace');
  // Pre-generated ref with a real auto-id but nothing written yet —
  // only actually used if this call turns out to be the bootstrap.
  const newWorkspaceRef = doc(collection(db, 'workspaces'));

  return runTransaction(db, async (tx) => {
    const uwSnap = await tx.get(userWorkspaceRef);
    if (uwSnap.exists()) {
      return uwSnap.data().workspaceId as string;
    }

    const pointerSnap = await tx.get(primaryPointerRef);

    if (pointerSnap.exists()) {
      // Shared workspace already exists — join it as a regular member.
      const workspaceId = pointerSnap.data().workspaceId as string;
      const memberRef = doc(db, 'workspaces', workspaceId, 'members', uid);
      tx.set(memberRef, {
        displayName,
        color: colorFor(uid),
        role: 'member',
        lastSeen: new Date().toISOString(),
      });
      tx.set(userWorkspaceRef, { workspaceId });
      return workspaceId;
    }

    // No shared workspace yet anywhere — this is the very first sign-in
    // ever. Create it, become its owner, and record the pointer so any
    // future sign-in from this same account joins this same one.
    const memberRef = doc(db, 'workspaces', newWorkspaceRef.id, 'members', uid);
    tx.set(newWorkspaceRef, {
      name: `${displayName}'s workspace`,
      inviteCode: randomInviteCode(),
      createdAt: new Date().toISOString(),
    });
    tx.set(memberRef, {
      displayName,
      color: colorFor(uid),
      role: 'owner',
      lastSeen: new Date().toISOString(),
    });
    tx.set(userWorkspaceRef, { workspaceId: newWorkspaceRef.id });
    tx.set(primaryPointerRef, { workspaceId: newWorkspaceRef.id });
    return newWorkspaceRef.id;
  });
}

type SessionStatus = 'local-only' | 'connecting' | 'signed-out' | 'ready';

interface SessionState {
  status: SessionStatus;
  clientId: string | null;
  workspace: WorkspaceSummary | null;
  member: WorkspaceMember | null;
  error: string | null;

  init: () => Promise<void>;
  // Two entry points, both restricted to ALLOWED_EMAILS (checked inside
  // identity.ts). Each resolves once Firestore has a workspace ready, or
  // throws/sets `error` on a wrong account, wrong password, or a sync
  // problem, so the caller (AuthGate) can show it.
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: isSyncConfigured ? 'connecting' : 'local-only',
  clientId: null,
  workspace: null,
  member: null,
  error: null,

  init: async () => {
    if (!isSyncConfigured) {
      set({ status: 'local-only' });
      return;
    }
    set({ status: 'connecting' });

    subscribeToAuthUser(async (user) => {
      if (!user || !dbFirestore) {
        set({ status: 'signed-out', clientId: null });
        return;
      }

      // Defense in depth: signInWithGoogle already rejects disallowed
      // emails at sign-in time, but a session from before that
      // restriction existed (or persisted from another device) would
      // otherwise still resume here on reload.
      if (!isAllowedEmail(user.email)) {
        await signOutUser();
        set({
          status: 'signed-out',
          clientId: null,
          error:
            'This app is only associated with sumitparazulee@gmail.com or hello@cmparajuli.com.np. Other accounts are restricted.',
        });
        return;
      }

      const clientId = user.uid;
      set({ clientId });

      try {
        const memberDisplayName = user.displayName || DEFAULT_DISPLAY_NAME;
        const workspaceId = await ensureWorkspaceForUser(clientId, memberDisplayName);

        const wsSnap = await getDoc(doc(dbFirestore, 'workspaces', workspaceId));
        const memberSnap = await getDoc(
          doc(dbFirestore, 'workspaces', workspaceId, 'members', clientId),
        );
        if (!wsSnap.exists() || !memberSnap.exists()) {
          throw new Error('Workspace data missing');
        }

        localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
        set({
          workspace: {
            id: workspaceId,
            name: wsSnap.data().name,
            inviteCode: wsSnap.data().inviteCode,
          },
          member: {
            workspaceId,
            userId: clientId,
            displayName: memberSnap.data().displayName,
            color: memberSnap.data().color,
            role: memberSnap.data().role,
          },
          status: 'ready',
          error: null,
        });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Could not set up workspace' });
      }
    });

    const existing = getCurrentUser();
    if (!existing) {
      set({ status: 'signed-out' });
    }
  },

  signInWithGoogle: async () => {
    set({ error: null });
    try {
      await signInWithGoogle();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Google sign-in failed' });
    }
  },

  signInWithEmail: async (email: string, password: string) => {
    set({ error: null });
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Email sign-in failed' });
    }
  },

  signOut: async () => {
    localStorage.removeItem(LAST_WORKSPACE_KEY);
    await signOutUser();
    set({ workspace: null, member: null, status: 'signed-out' });
  },
}));
