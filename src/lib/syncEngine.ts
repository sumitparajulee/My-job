import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { dbFirestore } from '@/lib/firebase';

export type LocalTable = 'jobs' | 'companies' | 'recruiters' | 'timelineEvents';

// Local table names double as Firestore collection names directly — no
// snake_case/camelCase mapping needed the way the Postgres-based versions
// of this sync engine required.
const COLLECTION: Record<LocalTable, string> = {
  jobs: 'jobs',
  companies: 'companies',
  recruiters: 'recruiters',
  timelineEvents: 'timelineEvents',
};

// Firestore rejects any field whose value is `undefined` outright — most
// optional Job/Company/Recruiter fields (salary, jobUrl, deadline, notes,
// priority, etc.) are `undefined` when left blank, so every write strips
// those keys first rather than sending them through and having setDoc
// throw "Unsupported field value: undefined".
function stripUndefined(row: object): DocumentData {
  const clean = { ...row } as Record<string, unknown>;
  Object.keys(clean).forEach((key) => {
    if (clean[key] === undefined) delete clean[key];
  });
  return clean as DocumentData;
}

/**
 * Push one row upstream. The row's own `id` field is used as the
 * Firestore document id, so this is a plain upsert — no separate
 * "does it exist yet" lookup needed (unlike the Convex version).
 *
 * This never needs to catch-and-queue the way earlier versions did:
 * Firestore's SDK (via enableIndexedDbPersistence in src/lib/firebase.ts)
 * already queues writes made while offline and resolves this promise
 * immediately from the local cache, then syncs for real in the
 * background on reconnect.
 */
export async function pushRow(table: LocalTable, row: object): Promise<void> {
  if (!dbFirestore) return; // local-only mode: nothing to push
  const id = (row as { id: string }).id;
  await setDoc(doc(dbFirestore, COLLECTION[table], id), stripUndefined(row));
}

export interface PresenceUser {
  userId: string; // Firebase anonymous auth uid
  displayName: string;
  color: string;
}

export type ConnectionStatus = 'connecting' | 'live' | 'offline';

interface WorkspaceSubscriptionHandlers {
  onChange: (table: LocalTable, row: Record<string, unknown>) => void;
  onPresence: (users: PresenceUser[]) => void;
  onStatus: (status: ConnectionStatus) => void;
}

/**
 * Subscribe to every entity collection for one workspace, plus presence
 * via a heartbeat + the members subcollection. Returns an unsubscribe
 * function.
 */
export function subscribeToWorkspace(
  workspaceId: string,
  self: PresenceUser,
  handlers: WorkspaceSubscriptionHandlers,
): () => void {
  if (!dbFirestore) {
    handlers.onStatus('offline');
    return () => {};
  }
  const db = dbFirestore;

  handlers.onStatus('connecting');
  const unsubs: Array<() => void> = [];

  (Object.keys(COLLECTION) as LocalTable[]).forEach((table) => {
    const q = query(collection(db, COLLECTION[table]), where('workspaceId', '==', workspaceId));
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snapshot) => {
        handlers.onStatus('live');
        // docChanges() gives real row-level added/modified events — the
        // initial snapshot fires "added" for every existing row, and
        // later snapshots fire only for what actually changed. No
        // manual diffing needed here (unlike the Convex version, whose
        // reactive queries return whole result sets instead).
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            handlers.onChange(table, change.doc.data());
          }
        });
      },
      () => handlers.onStatus('offline'),
    );
    unsubs.push(unsub);
  });

  const membersUnsub = onSnapshot(
    collection(db, 'workspaces', workspaceId, 'members'),
    (snapshot) => {
      const cutoff = Date.now() - 15_000;
      const online = snapshot.docs
        .map((d) => d.data() as { displayName: string; color: string; lastSeen: string })
        .filter((m) => new Date(m.lastSeen).getTime() > cutoff);
      handlers.onPresence(
        online.map((m, i) => ({
          userId: snapshot.docs[i].id,
          displayName: m.displayName,
          color: m.color,
        })),
      );
    },
  );
  unsubs.push(membersUnsub);

  const heartbeat = () =>
    void setDoc(
      doc(db, 'workspaces', workspaceId, 'members', self.userId),
      { displayName: self.displayName, color: self.color, lastSeen: new Date().toISOString() },
      { merge: true },
    );
  heartbeat();
  const heartbeatTimer = setInterval(heartbeat, 8_000);

  const onOnline = () => handlers.onStatus('live');
  const onOffline = () => handlers.onStatus('offline');
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  if (!navigator.onLine) handlers.onStatus('offline');

  return () => {
    clearInterval(heartbeatTimer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    unsubs.forEach((u) => u());
  };
}

/**
 * One-time "give me everything" read of every collection for a workspace,
 * bypassing onSnapshot entirely. This exists because the live subscription
 * in subscribeToWorkspace only starts pulling *after* SyncProvider mounts
 * it with a real workspace — if that never happened correctly on this
 * device (stale cache, a subscription that silently dropped to 'offline'
 * and never recovered, a workspace switch that raced the listener), the
 * live path can't be trusted to have ever delivered the backlog. A plain
 * getDocs() query is the one-shot fallback: point it at Firestore, get
 * back exactly what's there right now, no listener state to go stale.
 *
 * Returns rows grouped by table, in the same shape applyRemoteChange
 * expects — callers are expected to feed each row through that (or an
 * equivalent last-write-wins merge) rather than blindly overwriting.
 */
export async function pullWorkspaceSnapshot(
  workspaceId: string,
): Promise<Record<LocalTable, Record<string, unknown>[]>> {
  const empty: Record<LocalTable, Record<string, unknown>[]> = {
    jobs: [],
    companies: [],
    recruiters: [],
    timelineEvents: [],
  };
  if (!dbFirestore) return empty;
  const db = dbFirestore;

  const tables = Object.keys(COLLECTION) as LocalTable[];
  const snapshots = await Promise.all(
    tables.map((table) =>
      getDocs(query(collection(db, COLLECTION[table]), where('workspaceId', '==', workspaceId))),
    ),
  );

  const result = { ...empty };
  tables.forEach((table, i) => {
    result[table] = snapshots[i].docs.map((d) => d.data());
  });
  return result;
}
