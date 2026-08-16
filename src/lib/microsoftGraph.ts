import type { BackupPayload } from '@/lib/backup';
import { STATUS_LABELS, type Company, type Job } from '@/types/models';

// All calls go through the special app-folder path, which only exists
// because of the Files.ReadWrite.AppFolder scope — Graph creates and
// scopes "Apps/Docket" automatically the first time it's addressed this
// way, same idea as drive.file in googleDrive.ts. There's no separate
// "create the folder" step like Drive needs.
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const APP_FOLDER = `${GRAPH_ROOT}/me/drive/special/approot`;
const BACKUP_FILENAME = 'docket-backup.json';
const WORKBOOK_FILENAME = 'Docket — Job Applications.xlsx';
const WORKSHEET_NAME = 'Jobs';

async function graphFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
}

// ---------------------------------------------------------------------
// OneDrive backup
// ---------------------------------------------------------------------

// Simple upload (PUT :/content) is fine here — the JSON snapshot is
// well under the 4MB simple-upload ceiling for a personal job search.
// Overwrites the same filename in place each time (no write-new-then-
// delete-old dance like Drive needs), since Graph's app-folder path
// already treats this as one addressable resource, not a search result.
export async function uploadBackupToOneDrive(token: string, payload: BackupPayload): Promise<void> {
  const json = JSON.stringify(payload, null, 2);
  const res = await graphFetch(
    token,
    `${APP_FOLDER}:/${encodeURIComponent(BACKUP_FILENAME)}:/content`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json },
  );
  if (!res.ok) throw new Error(`OneDrive backup failed (${res.status})`);
}

// Returns null (not an error) when nothing has been backed up yet from
// this account — Graph 404s on a missing file, which is a normal
// "never connected" state here, not a failure.
export async function downloadBackupFromOneDrive(token: string): Promise<BackupPayload | null> {
  const res = await graphFetch(
    token,
    `${APP_FOLDER}:/${encodeURIComponent(BACKUP_FILENAME)}:/content`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OneDrive download failed (${res.status})`);
  return (await res.json()) as BackupPayload;
}

// ---------------------------------------------------------------------
// Excel workbook sync
// ---------------------------------------------------------------------

const HEADERS = [
  'Position',
  'Company',
  'Status',
  'Priority',
  'Salary',
  'Work Mode',
  'Employment Type',
  'Location',
  'Application Date',
  'Interview Date',
  'Offer Date',
  'Deadline',
  'Job URL',
  'Notes',
  'Last Updated',
];
const LAST_COLUMN = 'O'; // matches HEADERS.length, same convention as googleSheets.ts

function jobToRow(job: Job, companyName: string): (string | number)[] {
  return [
    job.position,
    companyName,
    STATUS_LABELS[job.status],
    job.priority ?? '',
    job.salary ?? '',
    job.workMode ?? '',
    job.employmentType ?? '',
    job.location ?? '',
    job.applicationDate ?? '',
    job.interviewDate ?? '',
    job.offerDate ?? '',
    job.deadline ?? '',
    job.jobUrl ?? '',
    job.notes ?? '',
    job.updatedAt,
  ];
}

// Creates the tracking workbook (with its one "Jobs" worksheet) the
// first time Docket connects. Graph's workbook API needs the file to
// exist before any range/worksheet call will work on it, so this is a
// two-step create: upload an empty .xlsx, then add the named sheet.
async function createWorkbook(token: string): Promise<string> {
  // A zero-byte PUT still creates a valid (if minimal) .xlsx that Excel
  // and the Graph workbook API both accept — Graph fills in the default
  // "Sheet1" on first open, which the addWorksheet call below then
  // supplements with our own named sheet.
  const createRes = await graphFetch(
    token,
    `${APP_FOLDER}:/${encodeURIComponent(WORKBOOK_FILENAME)}:/content`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      body: new Uint8Array(),
    },
  );
  if (!createRes.ok) throw new Error(`Workbook creation failed (${createRes.status})`);
  const created = (await createRes.json()) as { id: string };

  await graphFetch(
    token,
    `${GRAPH_ROOT}/me/drive/items/${created.id}/workbook/worksheets/add`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: WORKSHEET_NAME }),
    },
  );

  return created.id;
}

// Finds the workbook by its fixed filename in the app folder, creating
// it on first use. itemId is cached by the caller (see useMicrosoftStore)
// so repeat syncs don't need this lookup every time.
export async function ensureWorkbook(token: string): Promise<{ itemId: string; webUrl: string }> {
  const findRes = await graphFetch(
    token,
    `${APP_FOLDER}:/${encodeURIComponent(WORKBOOK_FILENAME)}?$select=id,webUrl`,
  );
  if (findRes.ok) {
    const found = (await findRes.json()) as { id: string; webUrl: string };
    return { itemId: found.id, webUrl: found.webUrl };
  }
  if (findRes.status !== 404) throw new Error(`Workbook lookup failed (${findRes.status})`);

  const itemId = await createWorkbook(token);
  const metaRes = await graphFetch(token, `${GRAPH_ROOT}/me/drive/items/${itemId}?$select=webUrl`);
  const meta = (await metaRes.json()) as { webUrl: string };
  return { itemId, webUrl: meta.webUrl };
}

// Full overwrite of the used range, same reasoning as syncJobsToSheet in
// googleSheets.ts: simplest way to stay correct across edits/deletes at
// the cost of resending every row, which is fine at personal-job-search
// scale.
export async function syncJobsToWorkbook(
  token: string,
  itemId: string,
  jobs: Job[],
  companies: Company[],
): Promise<void> {
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? 'Unknown';
  const sorted = [...jobs].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const values = [HEADERS, ...sorted.map((j) => jobToRow(j, companyName(j.companyId)))];

  // Clear a generous fixed range first so a shrinking job list (deletes)
  // doesn't leave stale rows dangling below the new, shorter data —
  // same fixed-range-clear approach as the Sheets version.
  const clearRange = `A1:${LAST_COLUMN}5000`;
  const clearRes = await graphFetch(
    token,
    `${GRAPH_ROOT}/me/drive/items/${itemId}/workbook/worksheets('${WORKSHEET_NAME}')/range(address='${clearRange}')/clear`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applyTo: 'Contents' }) },
  );
  if (!clearRes.ok) throw new Error(`Workbook clear failed (${clearRes.status})`);

  const writeRange = `A1:${LAST_COLUMN}${values.length}`;
  const writeRes = await graphFetch(
    token,
    `${GRAPH_ROOT}/me/drive/items/${itemId}/workbook/worksheets('${WORKSHEET_NAME}')/range(address='${writeRange}')`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) },
  );
  if (!writeRes.ok) throw new Error(`Workbook sync failed (${writeRes.status})`);
}
