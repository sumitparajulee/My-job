import type { BackupPayload } from '@/lib/backup';

// The `drive.file` scope only lets Docket see files/folders it creates
// itself — it can't be pointed at a folder that already existed in your
// Drive before Docket touched it. So instead of accepting an existing
// folder, Docket creates and owns one dedicated folder and always
// backs up there. You're free to rename or relocate that folder
// afterward in Drive's own UI; Docket tracks it by id, not by name/path.
const BACKUP_FOLDER_NAME = 'Docket Backups';
const BACKUP_FILENAME = 'docket-backup.json';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

async function driveFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  return res;
}

// Finds the folder if a previous session already created it, otherwise
// makes it. Called once per backup rather than cached across sessions —
// cheap (a single metadata query) and self-healing if the folder ever
// gets deleted out from under the app.
export async function ensureBackupFolder(token: string): Promise<string> {
  const q = encodeURIComponent(
    `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const findRes = await driveFetch(token, `${DRIVE_FILES_URL}?q=${q}&spaces=drive&fields=files(id)`);
  if (!findRes.ok) throw new Error(`Drive folder lookup failed (${findRes.status})`);
  const found = (await findRes.json()) as { files?: { id: string }[] };
  if (found.files?.[0]?.id) return found.files[0].id;

  const createRes = await driveFetch(token, DRIVE_FILES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) throw new Error(`Drive folder creation failed (${createRes.status})`);
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

async function createBackupFile(token: string, folderId: string, json: string): Promise<string> {
  const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json', parents: [folderId] };
  const boundary = 'docket-backup-boundary';
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${json}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(token, `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed (${res.status})`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function deleteBackupFile(token: string, fileId: string): Promise<void> {
  // Best-effort — a failed cleanup of the old file isn't worth failing
  // the whole backup over, since the new one already succeeded by the
  // time this runs. Worst case you have two files until the next cycle
  // tries again.
  try {
    await driveFetch(token, `${DRIVE_FILES_URL}/${fileId}`, { method: 'DELETE' });
  } catch {
    // ignored — see above
  }
}

// Finds the current backup file (if any) inside the Docket Backups
// folder and downloads + parses it. Returns null (not an error) when
// nothing has been backed up yet, or the folder doesn't exist — both are
// normal "never connected" states, not failures.
//
// This is the missing counterpart to uploadBackupToDrive: that function
// only ever writes to Drive, so without this there was no way to get
// data *out* of a Drive backup short of opening Drive by hand and
// re-importing the file through the manual JSON import flow.
export async function downloadBackupFromDrive(token: string): Promise<BackupPayload | null> {
  const folderQ = encodeURIComponent(
    `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const folderRes = await driveFetch(token, `${DRIVE_FILES_URL}?q=${folderQ}&spaces=drive&fields=files(id)`);
  if (!folderRes.ok) throw new Error(`Drive folder lookup failed (${folderRes.status})`);
  const folder = (await folderRes.json()) as { files?: { id: string }[] };
  const folderId = folder.files?.[0]?.id;
  if (!folderId) return null; // never backed up from this Google account

  const fileQ = encodeURIComponent(`name = '${BACKUP_FILENAME}' and '${folderId}' in parents and trashed = false`);
  const fileRes = await driveFetch(token, `${DRIVE_FILES_URL}?q=${fileQ}&spaces=drive&fields=files(id)`);
  if (!fileRes.ok) throw new Error(`Drive file lookup failed (${fileRes.status})`);
  const file = (await fileRes.json()) as { files?: { id: string }[] };
  const fileId = file.files?.[0]?.id;
  if (!fileId) return null;

  const contentRes = await driveFetch(token, `${DRIVE_FILES_URL}/${fileId}?alt=media`);
  if (!contentRes.ok) throw new Error(`Drive download failed (${contentRes.status})`);
  return (await contentRes.json()) as BackupPayload;
}

// Write-new-then-delete-old, not overwrite-in-place: if an upload ever
// fails partway, the previous backup is still sitting there untouched
// rather than being left half-written. previousFileId comes from
// wherever the caller persisted it after the last successful backup
// (see useGoogleStore) — pass null on the very first backup ever.
export async function uploadBackupToDrive(
  token: string,
  payload: BackupPayload,
  previousFileId: string | null,
): Promise<{ fileId: string; folderId: string }> {
  const folderId = await ensureBackupFolder(token);
  const json = JSON.stringify(payload, null, 2);
  const newFileId = await createBackupFile(token, folderId, json);

  if (previousFileId && previousFileId !== newFileId) {
    await deleteBackupFile(token, previousFileId);
  }

  return { fileId: newFileId, folderId };
}
