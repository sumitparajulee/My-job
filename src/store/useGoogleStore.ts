import { create } from 'zustand';
import { connectGoogle, disconnectGoogle, getSilentToken, isGoogleConfigured } from '@/lib/googleAuth';
import { downloadBackupFromDrive, uploadBackupToDrive } from '@/lib/googleDrive';
import {
  parseSpreadsheetId,
  syncJobsToSheet,
  verifySpreadsheetAccess,
} from '@/lib/googleSheets';
import { sendGmail } from '@/lib/gmail';
import { listRecentInboxMessages, matchEmailsToJobs, type InboxSignal } from '@/lib/gmailScan';
import { buildBackupPayload, importBackupPayload } from '@/lib/backup';
import type { Company, Job, Recruiter } from '@/types/models';

const LS_SHEET_ID = 'docket-google-sheet-id';
const LS_SHEET_URL = 'docket-google-sheet-url';
const LS_SHEET_SYNC_ENABLED = 'docket-google-sheet-sync-enabled';
const LS_DRIVE_BACKUP_ENABLED = 'docket-google-drive-backup-enabled';
const LS_LAST_SHEET_SYNC = 'docket-google-last-sheet-sync';
const LS_LAST_DRIVE_BACKUP = 'docket-google-last-drive-backup';
const LS_DRIVE_FOLDER_ID = 'docket-google-drive-folder-id';
const LS_DRIVE_BACKUP_FILE_ID = 'docket-google-drive-backup-file-id';
const LS_WAS_CONNECTED = 'docket-google-was-connected';
const LS_NOTIFY_ON_JOB_CHANGE = 'docket-google-notify-on-job-change';
const LS_NOTIFY_EMAIL = 'docket-google-notify-email';

const DEFAULT_NOTIFY_EMAIL = 'sumitparazulee@gmail.com';

// Every connected account/device uses this one spreadsheet by default —
// no manual "paste the link" step needed on a fresh device. See
// connect() below for what happens if a given account can't actually
// open it (not shared with them yet).
const DEFAULT_SHEET_ID = '1L_xxPx7Bdl1Q460TgLXeJMO3ZxBdXhSlWvRV-j72FTc';

const DRIVE_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // "once a day"

interface GoogleState {
  isConfigured: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  sheetId: string | null;
  sheetUrl: string | null;
  sheetSyncEnabled: boolean;
  driveBackupEnabled: boolean;
  lastSheetSyncAt: string | null;
  lastDriveBackupAt: string | null;
  driveFolderId: string | null;
  notifyOnJobChange: boolean;
  notifyEmail: string;
  lastError: string | null;

  connect: () => Promise<void>;
  disconnect: () => void;
  trySilentReconnect: () => Promise<void>;
  setSheetSyncEnabled: (enabled: boolean) => void;
  // Points Docket at a spreadsheet the user already has (pasted as a
  // link or bare ID) instead of the one auto-created on first connect.
  // This is what makes sync land in one shared sheet no matter which
  // Google/GitHub account each collaborator signs in with — see the
  // comment on `connect` below for why that matters.
  setSheetFromLink: (urlOrId: string) => Promise<void>;
  // Drops the stored sheetId so the next connect() (or the next manual
  // link) starts fresh, without touching the sync-enabled/notify settings.
  clearSheet: () => void;
  setDriveBackupEnabled: (enabled: boolean) => void;
  setNotifyOnJobChange: (enabled: boolean) => void;
  setNotifyEmail: (email: string) => void;
  syncSheetNow: (jobs: Job[], companies: Company[]) => Promise<void>;
  runDriveBackupIfDue: () => Promise<void>;
  backupNow: () => Promise<void>;
  restoreFromDrive: () => Promise<{ restored: boolean }>;
  sendMail: (toAddress: string, subject: string, content: string) => Promise<void>;
  scanInbox: (jobs: Job[], companies: Company[], recruiters: Recruiter[]) => Promise<InboxSignal[]>;
}

export const useGoogleStore = create<GoogleState>((set, get) => ({
  isConfigured: isGoogleConfigured,
  isConnected: false,
  isConnecting: false,
  sheetId: localStorage.getItem(LS_SHEET_ID),
  sheetUrl: localStorage.getItem(LS_SHEET_URL),
  sheetSyncEnabled: localStorage.getItem(LS_SHEET_SYNC_ENABLED) !== 'false',
  driveBackupEnabled: localStorage.getItem(LS_DRIVE_BACKUP_ENABLED) !== 'false',
  lastSheetSyncAt: localStorage.getItem(LS_LAST_SHEET_SYNC),
  lastDriveBackupAt: localStorage.getItem(LS_LAST_DRIVE_BACKUP),
  driveFolderId: localStorage.getItem(LS_DRIVE_FOLDER_ID),
  notifyOnJobChange: localStorage.getItem(LS_NOTIFY_ON_JOB_CHANGE) !== 'false',
  notifyEmail: localStorage.getItem(LS_NOTIFY_EMAIL) || DEFAULT_NOTIFY_EMAIL,
  lastError: null,

  // sheetId/sheetUrl live in this browser's localStorage, not in the
  // shared Firestore workspace, so a device that's never connected
  // before has no sheetId yet. Rather than auto-creating a brand new
  // spreadsheet in that case (which is what caused every collaborator
  // to end up with their own separate sheet), this points a fresh
  // device straight at DEFAULT_SHEET_ID — the one shared spreadsheet
  // everyone should be syncing to. That only works if the connecting
  // Google account already has edit access to it (share the sheet with
  // that account first); otherwise connect() fails with a clear message
  // instead of silently creating a second, different spreadsheet.
  // setSheetFromLink (Settings → "Sync to a specific sheet") can still
  // point a device at a different sheet later if that's ever needed.
  connect: async () => {
    set({ isConnecting: true, lastError: null });
    try {
      const token = await connectGoogle();
      let { sheetId, sheetUrl } = get();
      if (!sheetId) {
        const { url } = await verifySpreadsheetAccess(token, DEFAULT_SHEET_ID);
        sheetId = DEFAULT_SHEET_ID;
        sheetUrl = url;
        localStorage.setItem(LS_SHEET_ID, sheetId);
        localStorage.setItem(LS_SHEET_URL, sheetUrl);
      }
      localStorage.setItem(LS_WAS_CONNECTED, 'true');
      set({ isConnected: true, isConnecting: false, sheetId, sheetUrl });
    } catch (err) {
      set({
        isConnecting: false,
        lastError: err instanceof Error ? err.message : 'Could not connect to Google',
      });
      throw err;
    }
  },

  disconnect: () => {
    disconnectGoogle();
    localStorage.setItem(LS_WAS_CONNECTED, 'false');
    set({ isConnected: false });
  },

  setSheetFromLink: async (urlOrId) => {
    const spreadsheetId = parseSpreadsheetId(urlOrId);
    if (!spreadsheetId) {
      throw new Error("That doesn't look like a Google Sheets link or ID.");
    }
    const token = await getSilentToken();
    if (!token) {
      set({ isConnected: false });
      throw new Error('Google session expired — reconnect and try again.');
    }
    const { url } = await verifySpreadsheetAccess(token, spreadsheetId);
    localStorage.setItem(LS_SHEET_ID, spreadsheetId);
    localStorage.setItem(LS_SHEET_URL, url);
    // Clear the "last synced" timestamp — this is a different sheet than
    // whatever was last synced (if anything), so the old stamp would be
    // misleading until the next sync actually runs against it.
    localStorage.removeItem(LS_LAST_SHEET_SYNC);
    set({ sheetId: spreadsheetId, sheetUrl: url, lastSheetSyncAt: null, lastError: null });
  },

  clearSheet: () => {
    localStorage.removeItem(LS_SHEET_ID);
    localStorage.removeItem(LS_SHEET_URL);
    localStorage.removeItem(LS_LAST_SHEET_SYNC);
    set({ sheetId: null, sheetUrl: null, lastSheetSyncAt: null });
  },

  trySilentReconnect: async () => {
    if (localStorage.getItem(LS_WAS_CONNECTED) !== 'true') return;
    const token = await getSilentToken();
    if (token) set({ isConnected: true });
  },

  setSheetSyncEnabled: (enabled) => {
    localStorage.setItem(LS_SHEET_SYNC_ENABLED, String(enabled));
    set({ sheetSyncEnabled: enabled });
  },

  setDriveBackupEnabled: (enabled) => {
    localStorage.setItem(LS_DRIVE_BACKUP_ENABLED, String(enabled));
    set({ driveBackupEnabled: enabled });
  },

  setNotifyOnJobChange: (enabled) => {
    localStorage.setItem(LS_NOTIFY_ON_JOB_CHANGE, String(enabled));
    set({ notifyOnJobChange: enabled });
  },

  setNotifyEmail: (email) => {
    localStorage.setItem(LS_NOTIFY_EMAIL, email);
    set({ notifyEmail: email });
  },

  syncSheetNow: async (jobs, companies) => {
    const { isConnected, sheetSyncEnabled, sheetId } = get();
    if (!isConnected || !sheetSyncEnabled || !sheetId) return;
    const token = await getSilentToken();
    if (!token) {
      set({ isConnected: false });
      return;
    }
    try {
      await syncJobsToSheet(token, sheetId, jobs, companies);
      const stamp = new Date().toISOString();
      localStorage.setItem(LS_LAST_SHEET_SYNC, stamp);
      set({ lastSheetSyncAt: stamp, lastError: null });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Sheet sync failed' });
    }
  },

  runDriveBackupIfDue: async () => {
    const { isConnected, driveBackupEnabled, lastDriveBackupAt } = get();
    if (!isConnected || !driveBackupEnabled) return;
    if (lastDriveBackupAt && Date.now() - new Date(lastDriveBackupAt).getTime() < DRIVE_BACKUP_INTERVAL_MS) {
      return;
    }
    await runBackup(set);
  },

  backupNow: async () => {
    if (!get().isConnected) return;
    await runBackup(set);
  },

  restoreFromDrive: async () => {
    if (!get().isConnected) throw new Error('Connect a Google account first');
    const token = await getSilentToken();
    if (!token) {
      set({ isConnected: false });
      throw new Error('Google session expired — reconnect and try again');
    }
    try {
      const payload = await downloadBackupFromDrive(token);
      if (!payload) return { restored: false };
      await importBackupPayload(payload);
      set({ lastError: null });
      return { restored: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Drive restore failed';
      set({ lastError: message });
      throw err;
    }
  },

  sendMail: async (toAddress, subject, content) => {
    if (!get().isConnected) return;
    const token = await getSilentToken();
    if (!token) {
      set({ isConnected: false });
      return;
    }
    try {
      await sendGmail(token, { toAddress, subject, content });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Notification email failed' });
      throw err;
    }
  },

  scanInbox: async (jobs, companies, recruiters) => {
    if (!get().isConnected) throw new Error('Connect a Google account first');
    const token = await getSilentToken();
    if (!token) {
      set({ isConnected: false });
      throw new Error('Google session expired — reconnect and try again');
    }
    try {
      const emails = await listRecentInboxMessages(token);
      const signals = matchEmailsToJobs(emails, jobs, companies, recruiters);
      set({ lastError: null });
      return signals;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Inbox scan failed';
      set({ lastError: message });
      throw err;
    }
  },
}));

async function runBackup(set: (partial: Partial<GoogleState>) => void): Promise<void> {
  const token = await getSilentToken();
  if (!token) {
    set({ isConnected: false });
    return;
  }
  try {
    const payload = await buildBackupPayload();
    const previousFileId = localStorage.getItem(LS_DRIVE_BACKUP_FILE_ID);
    const { fileId, folderId } = await uploadBackupToDrive(token, payload, previousFileId);
    const stamp = new Date().toISOString();
    localStorage.setItem(LS_LAST_DRIVE_BACKUP, stamp);
    localStorage.setItem(LS_DRIVE_BACKUP_FILE_ID, fileId);
    localStorage.setItem(LS_DRIVE_FOLDER_ID, folderId);
    set({ lastDriveBackupAt: stamp, driveFolderId: folderId, lastError: null });
  } catch (err) {
    set({ lastError: err instanceof Error ? err.message : 'Drive backup failed' });
  }
}
