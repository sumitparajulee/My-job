import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { db } from '@/db/database';
import { useToastStore } from '@/store/useToastStore';
import { useGoogleStore } from '@/store/useGoogleStore';
import { pushRow, type LocalTable } from '@/lib/syncEngine';
import {
  STATUS_LABELS,
  type Company,
  type Job,
  type KanbanStatus,
  type NewJobInput,
  type Recruiter,
  type TimelineEvent,
} from '@/types/models';

// Used when sync isn't configured (or before a workspace is chosen) so the
// data model — and every Dexie/Supabase row — always has a workspaceId,
// even in fully local/offline mode.
export const LOCAL_WORKSPACE_ID = 'local';

interface DocketState {
  jobs: Job[];
  companies: Company[];
  recruiters: Recruiter[];
  timelineEvents: TimelineEvent[];
  isLoading: boolean;
  isReady: boolean;

  workspaceId: string;
  userId: string | null;

  init: (workspaceId?: string, userId?: string | null) => Promise<void>;
  reset: () => void;
  applyRemoteChange: (table: LocalTable, row: Record<string, unknown>) => void;

  timelineForJob: (jobId: string) => TimelineEvent[];
  addTimelineEvent: (jobId: string, label: string, note?: string) => Promise<TimelineEvent>;
  deleteTimelineEvent: (id: string) => Promise<void>;

  // Jobs sharing a company + a near-identical position (not archived) —
  // surfaced as a non-blocking warning when adding a new one, so
  // re-applying to the same role by accident is a choice, not a silent
  // duplicate on the board.
  findPossibleDuplicates: (companyName: string, position: string) => Job[];

  createJob: (input: NewJobInput) => Promise<Job>;
  quickAddJob: (raw: string, status: KanbanStatus) => Promise<Job>;
  updateJob: (id: string, patch: Partial<Job>) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  deleteJobWithUndo: (id: string) => Promise<void>;
  moveJob: (id: string, status: KanbanStatus, order: number) => Promise<void>;
  reorderWithinColumn: (status: KanbanStatus, orderedIds: string[]) => Promise<void>;

  upsertCompany: (name: string, patch?: Partial<Company>) => Promise<Company>;
  updateCompany: (id: string, patch: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  updateRecruiter: (id: string, patch: Partial<Recruiter>) => Promise<void>;
  createRecruiter: (input: Omit<Recruiter, 'id' | 'createdAt' | 'updatedAt' | 'workspaceId'>) => Promise<Recruiter>;
  deleteRecruiter: (id: string) => Promise<void>;
}

const now = () => new Date().toISOString();
const notDeleted = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

// Minimal HTML-entity escaping for free-text fields (job position, company
// name) that get interpolated into the notification email's HTML body.
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (input: string): string => input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

export const useDocketStore = create<DocketState>((set, get) => {
  // Every write goes: optimistic in-memory update -> Dexie (durable local
  // truth) -> best-effort push to Supabase (queued in the outbox on
  // failure, see syncEngine). Sync never blocks or rolls back the local
  // write; only a failed *local* (Dexie) write rolls back.
  const stamp = <T extends object>(row: T): T & { workspaceId: string; updatedBy?: string } => ({
    ...row,
    workspaceId: get().workspaceId,
    updatedBy: get().userId ?? undefined,
  });

  // Surfaces sync failures as a visible toast instead of letting them
  // vanish as an unhandled promise rejection — this is how we found out
  // job writes were silently failing to reach Firestore. Table + row id
  // + workspaceId are included because "Missing or insufficient
  // permissions" alone doesn't say *which* rule rejected it — the
  // workspaceId is the detail that actually distinguishes "rules aren't
  // published yet" from "this row's workspaceId doesn't match your
  // membership" from "wrong Firebase project entirely."
  const push = (table: LocalTable, row: object) => {
    pushRow(table, row).catch((err) => {
      const id = (row as { id?: string }).id ?? '?';
      const wsId = (row as { workspaceId?: string }).workspaceId ?? '?';
      useToastStore.getState().push({
        message: `Sync failed (${table}/${id}, workspace: ${wsId}): ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'danger',
        duration: 10000,
      });
    });
  };

  // Best-effort "a job entry changed" email, sent via whatever Google
  // account is connected in Settings (reuses the same connection as
  // Sheets sync/Drive backup — Gmail send is part of the scope Docket
  // already requests during Google connect). Mirrors the push() pattern
  // above: never blocks or rolls back the local write, and a failure
  // here is logged rather than surfaced as a toast on every single edit.
  const notifyJobChange = (action: 'created' | 'edited' | 'deleted', job: Job) => {
    const { isConnected, notifyOnJobChange, notifyEmail, sendMail } = useGoogleStore.getState();
    if (!isConnected || !notifyOnJobChange || !notifyEmail) return;
    const company = get().companies.find((c) => c.id === job.companyId);
    // position/company name are free text the user typed — they end up
    // inside an HTML email body below, so they're escaped before
    // interpolation. Without this, a job title like `<img src=x
    // onerror=...>` would be sent as live HTML to notifyEmail's inbox.
    const position = escapeHtml(job.position);
    const companyName = escapeHtml(company?.name ?? 'Unknown');
    const subject = `Docket: job entry ${action} — ${job.position}${company ? ` at ${company.name}` : ''}`;
    const content = `
      <p>A job entry was <strong>${action}</strong> in Docket.</p>
      <ul>
        <li><strong>Position:</strong> ${position}</li>
        <li><strong>Company:</strong> ${companyName}</li>
        <li><strong>Status:</strong> ${STATUS_LABELS[job.status]}</li>
        <li><strong>When:</strong> ${new Date(job.updatedAt).toLocaleString()}</li>
      </ul>
    `.trim();
    sendMail(notifyEmail, subject, content).catch((err) => {
      console.error('Job-change notification email failed to send:', err);
    });
  };

  return {
    jobs: [],
    companies: [],
    recruiters: [],
    timelineEvents: [],
    isLoading: false,
    isReady: false,
    workspaceId: LOCAL_WORKSPACE_ID,
    userId: null,

    init: async (workspaceId = LOCAL_WORKSPACE_ID, userId = null) => {
      set({ isLoading: true, isReady: false, workspaceId, userId });
      const [jobs, companies, recruiters, timelineEvents] = await Promise.all([
        db.jobs.where('workspaceId').equals(workspaceId).toArray(),
        db.companies.where('workspaceId').equals(workspaceId).toArray(),
        db.recruiters.where('workspaceId').equals(workspaceId).toArray(),
        db.timelineEvents.where('workspaceId').equals(workspaceId).toArray(),
      ]);
      set({
        jobs: notDeleted(jobs),
        companies: notDeleted(companies),
        recruiters: notDeleted(recruiters),
        timelineEvents: notDeleted(timelineEvents).sort((a, b) => a.date.localeCompare(b.date)),
        isLoading: false,
        isReady: true,
      });
    },

    // Switching workspaces (or signing out) clears in-memory state so the
    // next init() starts clean rather than briefly showing stale rows.
    reset: () => set({ jobs: [], companies: [], recruiters: [], timelineEvents: [], isReady: false }),

    // Called by the realtime subscription (see syncEngine.subscribeToWorkspace)
    // whenever another collaborator's change arrives. Last-write-wins on
    // `updatedAt`; a soft-deleted row is written to Dexie for tombstone
    // bookkeeping but filtered out of the visible in-memory arrays.
    applyRemoteChange: (table, row) => {
      const typed = row as unknown as { id: string; updatedAt: string; deletedAt?: string };

      if (table === 'jobs') {
        const local = get().jobs.find((j) => j.id === typed.id);
        if (local && local.updatedAt >= typed.updatedAt) return;
        void db.jobs.put(row as unknown as Job);
        const withoutRow = get().jobs.filter((j) => j.id !== typed.id);
        set({ jobs: typed.deletedAt ? withoutRow : [...withoutRow, row as unknown as Job] });
      } else if (table === 'companies') {
        const local = get().companies.find((c) => c.id === typed.id);
        if (local && local.updatedAt >= typed.updatedAt) return;
        void db.companies.put(row as unknown as Company);
        const withoutRow = get().companies.filter((c) => c.id !== typed.id);
        set({ companies: typed.deletedAt ? withoutRow : [...withoutRow, row as unknown as Company] });
      } else if (table === 'recruiters') {
        const local = get().recruiters.find((r) => r.id === typed.id);
        if (local && local.updatedAt >= typed.updatedAt) return;
        void db.recruiters.put(row as unknown as Recruiter);
        const withoutRow = get().recruiters.filter((r) => r.id !== typed.id);
        set({ recruiters: typed.deletedAt ? withoutRow : [...withoutRow, row as unknown as Recruiter] });
      } else if (table === 'timelineEvents') {
        const local = get().timelineEvents.find((t) => t.id === typed.id);
        if (local && local.updatedAt >= typed.updatedAt) return;
        void db.timelineEvents.put(row as unknown as TimelineEvent);
        const withoutRow = get().timelineEvents.filter((t) => t.id !== typed.id);
        set({
          timelineEvents: typed.deletedAt
            ? withoutRow
            : [...withoutRow, row as unknown as TimelineEvent],
        });
      }
    },

    timelineForJob: (jobId) =>
      get()
        .timelineEvents.filter((t) => t.jobId === jobId)
        .sort((a, b) => a.date.localeCompare(b.date)),

    addTimelineEvent: async (jobId, label, note) => {
      const event: TimelineEvent = stamp({
        id: nanoid(),
        jobId,
        label,
        date: now(),
        note,
        createdAt: now(),
        updatedAt: now(),
      });
      set({ timelineEvents: [...get().timelineEvents, event] });
      try {
        await db.timelineEvents.add(event);
      } catch (err) {
        set({ timelineEvents: get().timelineEvents.filter((t) => t.id !== event.id) });
        throw err;
      }
      void push('timelineEvents', event);
      return event;
    },

    deleteTimelineEvent: async (id) => {
      const prev = get().timelineEvents;
      const target = prev.find((t) => t.id === id);
      if (!target) return;
      const tombstoned: TimelineEvent = stamp({ ...target, deletedAt: now(), updatedAt: now() });
      set({ timelineEvents: prev.filter((t) => t.id !== id) });
      try {
        await db.timelineEvents.put(tombstoned);
      } catch (err) {
        set({ timelineEvents: prev });
        throw err;
      }
      void push('timelineEvents', tombstoned);
    },

    // Same company (case-insensitive) and a position string that's an
    // exact or near-exact match (ignoring case/whitespace) — catches
    // "Senior Designer" vs "senior designer " without flagging genuinely
    // different roles at the same company.
    findPossibleDuplicates: (companyName, position) => {
      const normalizedCompany = companyName.trim().toLowerCase();
      const normalizedPosition = position.trim().toLowerCase();
      if (!normalizedCompany || !normalizedPosition) return [];
      const company = get().companies.find((c) => c.name.toLowerCase() === normalizedCompany);
      if (!company) return [];
      return get().jobs.filter(
        (j) =>
          j.companyId === company.id &&
          j.status !== 'archived' &&
          j.position.trim().toLowerCase() === normalizedPosition,
      );
    },

    upsertCompany: async (name, patch) => {
      const trimmed = name.trim();
      const existing = get().companies.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existing) {
        if (patch) {
          const updated: Company = stamp({ ...existing, ...patch, updatedAt: now() });
          await db.companies.put(updated);
          set({ companies: get().companies.map((c) => (c.id === existing.id ? updated : c)) });
          void push('companies', updated);
          return updated;
        }
        return existing;
      }
      const company: Company = stamp({
        id: nanoid(),
        name: trimmed,
        createdAt: now(),
        updatedAt: now(),
        ...patch,
      });
      await db.companies.add(company);
      set({ companies: [...get().companies, company] });
      void push('companies', company);
      return company;
    },

    // Direct by-id update, used by the Companies page when editing an
    // existing company. upsertCompany matches by *name* instead, which is
    // right for the job-creation flow but would misfire here if a rename
    // happened to collide with another company's name.
    updateCompany: async (id, patch) => {
      const prev = get().companies;
      const target = prev.find((c) => c.id === id);
      if (!target) return;
      const updated: Company = stamp({ ...target, ...patch, updatedAt: now() });
      set({ companies: prev.map((c) => (c.id === id ? updated : c)) });
      try {
        await db.companies.put(updated);
      } catch (err) {
        set({ companies: prev });
        throw err;
      }
      void push('companies', updated);
    },

    // Soft delete, same tombstone pattern as jobs. Refuses to delete a
    // company that still has jobs pointing at it — the caller should
    // reassign or remove those jobs first (the UI surfaces this as a
    // toast rather than letting a job silently lose its company).
    deleteCompany: async (id) => {
      const inUse = get().jobs.some((j) => !j.deletedAt && j.companyId === id);
      if (inUse) {
        useToastStore.getState().push({
          message: 'Can\u2019t delete a company that still has applications linked to it.',
          tone: 'danger',
        });
        return;
      }
      const prev = get().companies;
      const target = prev.find((c) => c.id === id);
      if (!target) return;
      const tombstoned: Company = stamp({ ...target, deletedAt: now(), updatedAt: now() });
      set({ companies: prev.filter((c) => c.id !== id) });
      try {
        await db.companies.put(tombstoned);
      } catch (err) {
        set({ companies: prev });
        throw err;
      }
      void push('companies', tombstoned);
    },

    createJob: async (input) => {
      const company = await get().upsertCompany(input.companyName);
      const siblingCount = get().jobs.filter((j) => j.status === input.status).length;

      const job: Job = stamp({
        id: nanoid(),
        companyId: company.id,
        position: input.position,
        status: input.status,
        order: siblingCount,
        salary: input.salary,
        employmentType: input.employmentType,
        workMode: input.workMode,
        location: input.location,
        jobUrl: input.jobUrl,
        applicationDate: input.applicationDate,
        deadline: input.deadline,
        priority: input.priority,
        source: input.source,
        notes: input.notes,
        tags: input.tags ?? [],
        software: input.software ?? [],
        createdAt: now(),
        updatedAt: now(),
      });

      // Optimistic update: write to memory first, then persist. If the
      // local persist fails, roll the in-memory state back and surface the
      // error. The remote push (see stamp/pushRow) is separately
      // best-effort and never rolls back a successful local write.
      set({ jobs: [...get().jobs, job] });
      try {
        await db.jobs.add(job);
      } catch (err) {
        set({ jobs: get().jobs.filter((j) => j.id !== job.id) });
        throw err;
      }
      void push('jobs', job);
      notifyJobChange('created', job);
      void get().addTimelineEvent(job.id, `Added to ${STATUS_LABELS[job.status]}`);
      return job;
    },

    updateJob: async (id, patch) => {
      const prev = get().jobs;
      const target = prev.find((j) => j.id === id);
      if (!target) return;

      // A card dragged into "Applied" (or any later column) only carries
      // a status change — applicationDate is a separate field only set by
      // hand in the modal. Left alone, the card keeps reading "not
      // applied" while sitting in the Applied column. If this update is
      // moving the job out of the early stages for the first time and
      // nothing has set applicationDate yet (neither the existing job nor
      // this same patch), default it to today so the column and the date
      // stay in sync without extra manual steps.
      const EARLY_STAGES: KanbanStatus[] = ['wishlist', 'ready'];
      const autoApplicationDate =
        patch.status &&
        patch.status !== target.status &&
        !EARLY_STAGES.includes(patch.status) &&
        !target.applicationDate &&
        !patch.applicationDate
          ? new Date().toISOString().slice(0, 10)
          : undefined;

      const updated: Job = stamp({
        ...target,
        ...patch,
        ...(autoApplicationDate ? { applicationDate: autoApplicationDate } : {}),
        updatedAt: now(),
      });
      set({ jobs: prev.map((j) => (j.id === id ? updated : j)) });
      try {
        await db.jobs.put(updated);
      } catch (err) {
        set({ jobs: prev });
        throw err;
      }
      void push('jobs', updated);
      notifyJobChange('edited', updated);
      if (patch.status && patch.status !== target.status) {
        void get().addTimelineEvent(id, `Moved to ${STATUS_LABELS[patch.status]}`);
      }
    },

    quickAddJob: async (raw, status) => {
      const text = raw.trim();
      const atIndex = text.toLowerCase().lastIndexOf(' at ');
      const position = atIndex === -1 ? text : text.slice(0, atIndex).trim();
      const companyName = atIndex === -1 ? 'Unspecified' : text.slice(atIndex + 4).trim();
      return get().createJob({
        companyName: companyName || 'Unspecified',
        position: position || text,
        status,
        tags: [],
      });
    },

    // Soft delete: a live collaborator needs to *see* the removal as an
    // event (and the undo below needs something to resurrect), so this
    // stamps deletedAt rather than issuing a hard Dexie/Postgres DELETE.
    deleteJob: async (id) => {
      const prev = get().jobs;
      const target = prev.find((j) => j.id === id);
      if (!target) return;
      const tombstoned: Job = stamp({ ...target, deletedAt: now(), updatedAt: now() });
      set({ jobs: prev.filter((j) => j.id !== id) });
      try {
        await db.jobs.put(tombstoned);
      } catch (err) {
        set({ jobs: prev });
        throw err;
      }
      void push('jobs', tombstoned);
      notifyJobChange('deleted', tombstoned);
    },

    deleteJobWithUndo: async (id) => {
      const target = get().jobs.find((j) => j.id === id);
      if (!target) return;
      await get().deleteJob(id);
      useToastStore.getState().push({
        message: `Removed "${target.position}"`,
        tone: 'danger',
        actionLabel: 'Undo',
        duration: 6000,
        onAction: async () => {
          const restored: Job = stamp({ ...target, deletedAt: undefined, updatedAt: now() });
          set({ jobs: [...get().jobs, restored] });
          await db.jobs.put(restored);
          void push('jobs', restored);
        },
      });
    },

    moveJob: async (id, status, order) => {
      await get().updateJob(id, { status, order });
    },

    reorderWithinColumn: async (status, orderedIds) => {
      const prev = get().jobs;
      const updated = prev.map((j) => {
        if (j.status !== status) return j;
        const idx = orderedIds.indexOf(j.id);
        return idx === -1 ? j : stamp({ ...j, order: idx, updatedAt: now() });
      });
      set({ jobs: updated });
      const changed = updated.filter((j) => j.status === status);
      try {
        await db.jobs.bulkPut(changed);
      } catch (err) {
        set({ jobs: prev });
        throw err;
      }
      changed.forEach((j) => void push('jobs', j));
    },

    createRecruiter: async (input) => {
      const recruiter: Recruiter = stamp({
        id: nanoid(),
        createdAt: now(),
        updatedAt: now(),
        ...input,
      });
      set({ recruiters: [...get().recruiters, recruiter] });
      await db.recruiters.add(recruiter);
      void push('recruiters', recruiter);
      return recruiter;
    },

    updateRecruiter: async (id, patch) => {
      const prev = get().recruiters;
      const target = prev.find((r) => r.id === id);
      if (!target) return;
      const updated = stamp({ ...target, ...patch, updatedAt: now() });
      set({ recruiters: prev.map((r) => (r.id === id ? updated : r)) });
      try {
        await db.recruiters.put(updated);
      } catch (err) {
        set({ recruiters: prev });
        throw err;
      }
      void push('recruiters', updated);
    },

    // Soft delete, same tombstone pattern as companies/jobs. Unlike
    // companies, a recruiter is an *optional* pointer on Job
    // (recruiterId?), so deletion doesn't need to be blocked — instead
    // any job pointing at this recruiter is unlinked so it never
    // references a deleted row.
    deleteRecruiter: async (id) => {
      const prev = get().recruiters;
      const target = prev.find((r) => r.id === id);
      if (!target) return;
      const tombstoned: Recruiter = stamp({ ...target, deletedAt: now(), updatedAt: now() });
      set({ recruiters: prev.filter((r) => r.id !== id) });
      try {
        await db.recruiters.put(tombstoned);
      } catch (err) {
        set({ recruiters: prev });
        throw err;
      }
      void push('recruiters', tombstoned);

      const linkedJobs = get().jobs.filter((j) => j.recruiterId === id);
      for (const job of linkedJobs) {
        await get().updateJob(job.id, { recruiterId: undefined });
      }
    },
  };
});
