import Dexie, { type Table } from 'dexie';
import type { Company, DocketDocument, Job, MessageTemplate, Recruiter, TimelineEvent } from '@/types/models';

// A leftover from earlier sync-backend versions (Supabase/Convex), where
// a failed push needed to be queued and retried by hand. The current
// Firestore-based sync engine (src/lib/syncEngine.ts) doesn't use this —
// Firestore's own offline persistence (enableIndexedDbPersistence in
// src/lib/firebase.ts) queues and retries writes made offline natively.
// Table kept in the schema rather than migrated out, to avoid an
// unnecessary Dexie version bump for something with no downside sitting
// unused.
export interface OutboxEntry {
  id?: number; // auto-increment
  table: 'jobs' | 'companies' | 'recruiters' | 'timelineEvents';
  rowId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

// A full-data snapshot taken automatically right before anything that
// bulk-overwrites local data (importBackup, Google/Microsoft Drive
// restore). Lets a bad restore — wrong file, stale cloud backup, an
// accidental double-click on Import — be undone from Settings, without
// the person having had to think to export a backup first. `payload` is
// a JSON-stringified BackupPayload (see lib/backup.ts); stored as text
// rather than structured so this table's shape never needs to change
// just because BackupPayload's does. Pruned to the most recent few by
// saveSafetySnapshot — this is a short-lived undo buffer, not an
// archive.
export interface SafetySnapshot {
  id: string;
  createdAt: number;
  reason: string;
  payload: string;
}

// Docket's IndexedDB schema. Dexie gives us indexes, transactions, and
// versioned migrations for free — this is the durable single source of
// truth; the Zustand store is just a reactive in-memory mirror of it.
export class DocketDB extends Dexie {
  jobs!: Table<Job, string>;
  companies!: Table<Company, string>;
  recruiters!: Table<Recruiter, string>;
  timelineEvents!: Table<TimelineEvent, string>;
  outbox!: Table<OutboxEntry, number>;
  documents!: Table<DocketDocument, string>;
  templates!: Table<MessageTemplate, string>;
  safetySnapshots!: Table<SafetySnapshot, string>;

  constructor() {
    super('docket-v2');

    this.version(1).stores({
      // '&id' = unique primary key. Extra fields are indexed for fast lookups/filters.
      jobs: '&id, companyId, recruiterId, status, order, priority, applicationDate, deadline',
      companies: '&id, name',
      recruiters: '&id, companyId, name, nextFollowUp',
      timelineEvents: '&id, jobId, date',
    });

    // v2 — workspace-scoped realtime sync. Adds workspaceId/deletedAt
    // indexes (deletes are soft, see models.ts SyncMeta) and an outbox
    // for writes made while offline or against an unreachable server.
    this.version(2).stores({
      jobs: '&id, companyId, recruiterId, status, order, priority, applicationDate, deadline, workspaceId, deletedAt',
      companies: '&id, name, workspaceId, deletedAt',
      recruiters: '&id, companyId, name, nextFollowUp, workspaceId, deletedAt',
      timelineEvents: '&id, jobId, date, workspaceId, deletedAt',
      outbox: '++id, table, rowId, createdAt',
    });

    // v3 — local-only Documents (resume/cover letter/CV/portfolio uploads).
    // Not part of the outbox/sync system: files are stored as base64 and
    // never pushed to Firestore, so no workspaceId/deletedAt indexes here.
    this.version(3).stores({
      jobs: '&id, companyId, recruiterId, status, order, priority, applicationDate, deadline, workspaceId, deletedAt',
      companies: '&id, name, workspaceId, deletedAt',
      recruiters: '&id, companyId, name, nextFollowUp, workspaceId, deletedAt',
      timelineEvents: '&id, jobId, date, workspaceId, deletedAt',
      outbox: '++id, table, rowId, createdAt',
      documents: '&id, type, createdAt',
    });

    // v4 — local-only message templates (follow-up/thank-you/outreach
    // copy). Same rationale as Documents above: personal boilerplate
    // text, never pushed to Firestore, so no workspaceId/deletedAt index.
    this.version(4).stores({
      jobs: '&id, companyId, recruiterId, status, order, priority, applicationDate, deadline, workspaceId, deletedAt',
      companies: '&id, name, workspaceId, deletedAt',
      recruiters: '&id, companyId, name, nextFollowUp, workspaceId, deletedAt',
      timelineEvents: '&id, jobId, date, workspaceId, deletedAt',
      outbox: '++id, table, rowId, createdAt',
      documents: '&id, type, createdAt',
      templates: '&id, kind, createdAt',
    });

    // v5 — pre-restore safety snapshots (undo buffer for Import backup /
    // Google Drive restore / OneDrive restore). Local-only, never synced.
    this.version(5).stores({
      jobs: '&id, companyId, recruiterId, status, order, priority, applicationDate, deadline, workspaceId, deletedAt',
      companies: '&id, name, workspaceId, deletedAt',
      recruiters: '&id, companyId, name, nextFollowUp, workspaceId, deletedAt',
      timelineEvents: '&id, jobId, date, workspaceId, deletedAt',
      outbox: '++id, table, rowId, createdAt',
      documents: '&id, type, createdAt',
      templates: '&id, kind, createdAt',
      safetySnapshots: '&id, createdAt',
    });
  }
}

export const db = new DocketDB();
