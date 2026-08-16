import { db } from '@/db/database';
import { useDocketStore } from '@/store/useDocketStore';
import { isSyncConfigured } from '@/lib/firebase';
import { pullWorkspaceSnapshot, pushRow, type LocalTable } from '@/lib/syncEngine';
import { KANBAN_STATUSES, STATUS_LABELS, type KanbanStatus } from '@/types/models';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  jobs: unknown[];
  companies: unknown[];
  recruiters: unknown[];
  timelineEvents: unknown[];
  documents: unknown[];
}

// Shared by the manual "Export backup" button and the Google Drive
// auto-backup — both need the exact same snapshot shape, just delivered
// to a different destination (a downloaded file vs. an uploaded one).
export async function buildBackupPayload(): Promise<BackupPayload> {
  const [jobs, companies, recruiters, timelineEvents, documents] = await Promise.all([
    db.jobs.toArray(),
    db.companies.toArray(),
    db.recruiters.toArray(),
    db.timelineEvents.toArray(),
    db.documents.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    jobs,
    companies,
    recruiters,
    timelineEvents,
    documents,
  };
}

// Full local export — everything in IndexedDB, regardless of workspace.
// Documents are already base64 in Dexie, so they come along in the same
// JSON file with no extra encoding step.
export async function exportBackup(): Promise<void> {
  const payload = await buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `docket-backup-${payload.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// One row per job, company/recruiter names resolved rather than left as
// raw ids — this is for opening in a spreadsheet, not for re-importing,
// so it optimizes for readability over round-tripping. Use exportBackup
// (JSON) for anything meant to be restored later.
function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export async function exportJobsCsv(): Promise<void> {
  const [jobs, companies, recruiters] = await Promise.all([
    db.jobs.toArray(),
    db.companies.toArray(),
    db.recruiters.toArray(),
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c.name]));
  const recruiterById = new Map(recruiters.map((r) => [r.id, r.name]));

  const headers = [
    'Position',
    'Company',
    'Status',
    'Recruiter',
    'Location',
    'Salary',
    'Employment type',
    'Work mode',
    'Priority',
    'Rating',
    'Applied on',
    'Deadline',
    'Interview date',
    'Offer date',
    'Job URL',
    'Tags',
    'Notes',
    'Created',
    'Last updated',
  ];

  const rows = jobs
    .filter((j) => !j.deletedAt)
    .map((j) => [
      j.position,
      companyById.get(j.companyId) ?? '',
      j.status,
      j.recruiterId ? recruiterById.get(j.recruiterId) ?? '' : '',
      j.location ?? '',
      j.salary ?? '',
      j.employmentType ?? '',
      j.workMode ?? '',
      j.priority ?? '',
      j.rating ?? '',
      j.applicationDate ?? '',
      j.deadline ?? '',
      j.interviewDate ?? '',
      j.offerDate ?? '',
      j.jobUrl ?? '',
      j.tags.join('; '),
      j.notes ?? '',
      j.createdAt,
      j.updatedAt,
    ]);

  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `docket-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// A printable/shareable snapshot of the pipeline — status counts up top,
// then one table per status (in board order) so it reads like the
// Kanban board rather than a flat spreadsheet dump. Meant for sharing
// with a mentor/recruiter or keeping a dated paper trail; exportJobsCsv
// is the better fit for further analysis, exportBackup (JSON) for a
// restorable backup.
export async function exportJobsPdf(): Promise<void> {
  const [jobs, companies, recruiters] = await Promise.all([
    db.jobs.toArray(),
    db.companies.toArray(),
    db.recruiters.toArray(),
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c.name]));
  const recruiterById = new Map(recruiters.map((r) => [r.id, r.name]));
  const liveJobs = jobs.filter((j) => !j.deletedAt);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date();

  doc.setFontSize(16);
  doc.text('Docket — Job Applications', 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${generatedAt.toLocaleString()} · ${liveJobs.length} total`, 40, 56);
  doc.setTextColor(0);

  let cursorY = 76;

  const byStatus = new Map<KanbanStatus, typeof liveJobs>();
  for (const status of KANBAN_STATUSES) byStatus.set(status, []);
  for (const job of liveJobs) byStatus.get(job.status)?.push(job);

  for (const status of KANBAN_STATUSES) {
    const rows = byStatus.get(status) ?? [];
    if (rows.length === 0) continue;

    if (cursorY > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage();
      cursorY = 40;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${STATUS_LABELS[status]} (${rows.length})`, 40, cursorY);
    doc.setFont('helvetica', 'normal');
    cursorY += 8;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: 40, right: 40 },
      head: [['Position', 'Company', 'Recruiter', 'Location', 'Salary', 'Applied', 'Deadline']],
      body: rows
        .sort((a, b) => a.order - b.order)
        .map((j) => [
          j.position,
          companyById.get(j.companyId) ?? '',
          j.recruiterId ? recruiterById.get(j.recruiterId) ?? '' : '',
          j.location ?? '',
          j.salary ?? '',
          j.applicationDate ?? '',
          j.deadline ?? '',
        ]),
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [40, 40, 40] },
      theme: 'striped',
      tableWidth: pageWidth - 80,
    });

    // autoTable annotates the doc with the Y position it finished at.
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  doc.save(`docket-jobs-${generatedAt.toISOString().slice(0, 10)}.pdf`);
}

// Pushes every local row up to Firestore, regardless of whether it was
// ever successfully synced before. This is the "catch-up" counterpart to
// pushRow-on-every-write: normal saves only push what just changed, so
// anything created while sync was broken (bad rules, no connection, sync
// not configured yet) stays stuck locally forever unless something walks
// the *entire* local dataset and re-pushes it once. Safe to run more than
// once — it's a plain upsert per row (setDoc), not an append.
export async function resyncAllToCloud(workspaceId: string): Promise<{ pushed: number }> {
  if (!isSyncConfigured) {
    throw new Error('Sync isn\u2019t configured, so there\u2019s nowhere to push to.');
  }
  const [jobs, companies, recruiters, timelineEvents] = await Promise.all([
    db.jobs.where('workspaceId').equals(workspaceId).toArray(),
    db.companies.where('workspaceId').equals(workspaceId).toArray(),
    db.recruiters.where('workspaceId').equals(workspaceId).toArray(),
    db.timelineEvents.where('workspaceId').equals(workspaceId).toArray(),
  ]);

  const rows: Array<{ table: LocalTable; row: Record<string, unknown> }> = [
    ...jobs.map((row) => ({ table: 'jobs' as LocalTable, row: row as unknown as Record<string, unknown> })),
    ...companies.map((row) => ({ table: 'companies' as LocalTable, row: row as unknown as Record<string, unknown> })),
    ...recruiters.map((row) => ({ table: 'recruiters' as LocalTable, row: row as unknown as Record<string, unknown> })),
    ...timelineEvents.map((row) => ({ table: 'timelineEvents' as LocalTable, row: row as unknown as Record<string, unknown> })),
  ];

  // Sequential, not Promise.all — pushing hundreds of docs at once against
  // freshly-published rules is exactly the kind of burst that trips
  // Firestore's per-second write-rate warnings on a brand-new index; a
  // simple queue avoids that without needing batched writes for what's
  // typically a one-time, few-hundred-row catch-up.
  let pushed = 0;
  for (const { table, row } of rows) {
    await pushRow(table, row);
    pushed += 1;
  }
  return { pushed };
}

// The download counterpart to resyncAllToCloud. That function walks local
// data and pushes it up; this one walks Firestore and merges it down —
// the explicit "Pull latest from cloud" action for whenever a device's
// local data is missing rows that are known to already be in the cloud
// (a fresh browser, a cleared cache, a live subscription that never
// actually caught up). Safe to run any time: every row goes through the
// store's normal last-write-wins comparison (applyRemoteChange), so it
// can never clobber a newer local edit with an older cloud one.
export async function pullLatestFromCloud(workspaceId: string): Promise<{ pulled: number }> {
  if (!isSyncConfigured) {
    throw new Error('Sync isn\u2019t configured, so there\u2019s nothing to pull from.');
  }
  const snapshot = await pullWorkspaceSnapshot(workspaceId);
  const { applyRemoteChange } = useDocketStore.getState();

  let pulled = 0;
  (Object.keys(snapshot) as LocalTable[]).forEach((table) => {
    snapshot[table].forEach((row) => {
      applyRemoteChange(table, row);
      pulled += 1;
    });
  });
  return { pulled };
}

const MAX_SAFETY_SNAPSHOTS = 3;

// Snapshots current IndexedDB state into the safetySnapshots table before
// something is about to bulk-overwrite it. Keeps only the most recent
// MAX_SAFETY_SNAPSHOTS — this is a short undo buffer, not a backup
// archive (exportBackup / the Drive auto-backups cover that job).
export async function saveSafetySnapshot(reason: string): Promise<void> {
  const payload = await buildBackupPayload();
  const createdAt = Date.now();
  await db.safetySnapshots.add({
    id: `${reason}-${createdAt}`,
    createdAt,
    reason,
    payload: JSON.stringify(payload),
  });

  const all = await db.safetySnapshots.orderBy('createdAt').reverse().toArray();
  const stale = all.slice(MAX_SAFETY_SNAPSHOTS);
  if (stale.length) await db.safetySnapshots.bulkDelete(stale.map((s) => s.id));
}

export interface SafetySnapshotMeta {
  id: string;
  createdAt: number;
  reason: string;
}

export async function getLatestSafetySnapshot(): Promise<SafetySnapshotMeta | null> {
  const latest = await db.safetySnapshots.orderBy('createdAt').reverse().first();
  if (!latest) return null;
  return { id: latest.id, createdAt: latest.createdAt, reason: latest.reason };
}

// Restores a previously-saved safety snapshot. Goes through the same
// importBackupPayload path as every other restore, so it's subject to
// the exact same workspace-retagging and cloud re-push behavior — and,
// deliberately, it takes a fresh safety snapshot of its own first, so
// undoing a restore is itself undoable.
export async function restoreSafetySnapshot(id: string): Promise<void> {
  const snap = await db.safetySnapshots.get(id);
  if (!snap) throw new Error('That snapshot no longer exists.');
  const payload = JSON.parse(snap.payload) as Partial<BackupPayload>;
  await importBackupPayload(payload);
}

// bulkPut (not bulkAdd) so importing the same backup twice is safe —
// existing rows with matching ids are just overwritten, not duplicated.
//
// Restored rows are re-tagged to whatever workspace is currently active
// (LOCAL_WORKSPACE_ID if sync isn't set up, or your joined workspace's id
// if it is) rather than trusting whatever workspaceId the backup file
// happened to carry. Otherwise a restore can silently land data under a
// workspaceId nothing is querying — same "nothing happened" failure mode
// as an unrecognized file shape, just one layer deeper.
//
// If sync is configured, restored rows are also pushed to Firestore —
// a bare bulkPut only writes to this device's local IndexedDB, so without
// this, restored data would stay invisible to every other device in the
// workspace until each row was touched again through the UI.
export async function importBackup(file: File): Promise<void> {
  const text = await file.text();
  const payload = JSON.parse(text) as Partial<BackupPayload>;
  await importBackupPayload(payload);
}

// The actual restore logic, shared by importBackup (manual JSON file) and
// restoreFromDrive (useGoogleStore) — both end up with a BackupPayload
// object, just from a different source, and both need the exact same
// retagging + bulkPut + re-push handling.
export async function importBackupPayload(payload: Partial<BackupPayload>): Promise<void> {
  // Snapshot whatever's currently in IndexedDB before it gets overwritten
  // below. Best-effort: a snapshot failure (e.g. quota) shouldn't block
  // the restore the person actually asked for.
  try {
    await saveSafetySnapshot('pre-restore');
  } catch (err) {
    console.error('Could not save pre-restore safety snapshot', err);
  }

  const activeWorkspaceId = useDocketStore.getState().workspaceId;
  const retag = (rows: unknown[] | undefined): Record<string, unknown>[] =>
    ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
      ...row,
      workspaceId: activeWorkspaceId,
    }));

  const jobs = retag(payload.jobs);
  const companies = retag(payload.companies);
  const recruiters = retag(payload.recruiters);
  const timelineEvents = retag(payload.timelineEvents);
  const documents = (payload.documents ?? []) as never[]; // documents aren't workspace-scoped

  await db.transaction(
    'rw',
    db.jobs,
    db.companies,
    db.recruiters,
    db.timelineEvents,
    db.documents,
    async () => {
      if (companies.length) await db.companies.bulkPut(companies as never[]);
      if (jobs.length) await db.jobs.bulkPut(jobs as never[]);
      if (recruiters.length) await db.recruiters.bulkPut(recruiters as never[]);
      if (timelineEvents.length) await db.timelineEvents.bulkPut(timelineEvents as never[]);
      if (documents.length) await db.documents.bulkPut(documents);
    },
  );

  if (isSyncConfigured) {
    const pushAll = (table: LocalTable, rows: Record<string, unknown>[]) =>
      Promise.all(rows.map((row) => pushRow(table, row)));
    await Promise.all([
      pushAll('companies', companies),
      pushAll('jobs', jobs),
      pushAll('recruiters', recruiters),
      pushAll('timelineEvents', timelineEvents),
    ]);
  }
}
