import { STATUS_LABELS, type Company, type Job } from '@/types/models';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEET_NAME = 'Jobs';
const LAST_COLUMN = 'O'; // matches HEADERS.length below

// Accepts either a bare spreadsheet ID or a full Google Sheets URL
// (e.g. https://docs.google.com/spreadsheets/d/<id>/edit#gid=0) and
// returns just the ID, or null if neither pattern matches.
export function parseSpreadsheetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  // A bare ID: Sheets IDs are long alphanumeric (plus - and _) strings
  // with no slashes or spaces.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

// Confirms the given token can actually open this spreadsheet (shared
// with that account, not deleted, etc.) and returns its canonical URL.
// Throws with a message suitable for surfacing to the user on failure.
export async function verifySpreadsheetAccess(
  token: string,
  spreadsheetId: string,
): Promise<{ url: string }> {
  const res = await fetch(
    `${SHEETS_BASE}/${spreadsheetId}?fields=spreadsheetUrl`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) {
    throw new Error('Spreadsheet not found — check the link or ID.');
  }
  if (res.status === 403) {
    throw new Error('This Google account does not have access to that spreadsheet.');
  }
  if (!res.ok) throw new Error(`Could not open spreadsheet (${res.status})`);
  const data = (await res.json()) as { spreadsheetUrl: string };
  return { url: data.spreadsheetUrl };
}

export async function createTrackingSpreadsheet(
  token: string,
): Promise<{ id: string; url: string }> {
  const res = await fetch(SHEETS_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title: "Docket \u2014 Job Applications" },
      sheets: [{ properties: { title: SHEET_NAME } }],
    }),
  });
  if (!res.ok) throw new Error(`Could not create spreadsheet (${res.status})`);
  const data = (await res.json()) as { spreadsheetId: string; spreadsheetUrl: string };
  return { id: data.spreadsheetId, url: data.spreadsheetUrl };
}

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

// Full overwrite, not an append/patch — simplest way to stay correct
// when jobs are edited, reordered, or deleted, at the cost of resending
// every row on each sync. Fine at this data scale (a personal job
// search, not thousands of rows).
export async function syncJobsToSheet(
  token: string,
  spreadsheetId: string,
  jobs: Job[],
  companies: Company[],
): Promise<void> {
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? 'Unknown';
  const sorted = [...jobs].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const rows = [HEADERS, ...sorted.map((j) => jobToRow(j, companyName(j.companyId)))];

  // Clear a generous fixed range first so a shrinking job list (deletes)
  // doesn't leave stale rows dangling below the new, shorter data.
  const clearRes = await fetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${SHEET_NAME}!A1:${LAST_COLUMN}5000:clear`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  if (!clearRes.ok) throw new Error(`Sheet clear failed (${clearRes.status})`);

  const range = `${SHEET_NAME}!A1:${LAST_COLUMN}${rows.length}`;
  const res = await fetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, values: rows }),
    },
  );
  if (!res.ok) throw new Error(`Sheet sync failed (${res.status})`);
}
