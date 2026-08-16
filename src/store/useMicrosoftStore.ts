import { create } from 'zustand';
import {
  connectMicrosoft,
  disconnectMicrosoft,
  getSilentToken,
  isMicrosoftConfigured,
  trySilentMicrosoftReconnect,
} from '@/lib/microsoftAuth';
import {
  downloadBackupFromOneDrive,
  ensureWorkbook,
  syncJobsToWorkbook,
  uploadBackupToOneDrive,
} from '@/lib/microsoftGraph';
import { buildBackupPayload, importBackupPayload } from '@/lib/backup';
import type { Company, Job } from '@/types/models';

const LS_WORKBOOK_ITEM_ID = 'docket-microsoft-workbook-item-id';
const LS_WORKBOOK_URL = 'docket-microsoft-workbook-url';
const LS_SHEET_SYNC_ENABLED = 'docket-microsoft-sheet-sync-enabled';
const LS_DRIVE_BACKUP_ENABLED = 'docket-microsoft-drive-backup-enabled';
const LS_LAST_SHEET_SYNC = 'docket-microsoft-last-sheet-sync';
const LS_LAST_DRIVE_BACKUP = 'docket-microsoft-last-drive-backup';
const LS_WAS_CONNECTED = 'docket-microsoft-was-connected';

const DRIVE_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // "once a day", see MICROSOFT_SETUP.md

interface MicrosoftState {
  isConfigured: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  workbookItemId: string | null;
  workbookUrl: string | null;
  sheetSyncEnabled: boolean;
  driveBackupEnabled: boolean;
  lastSheetSyncAt: string | null;
  lastDriveBackupAt: string | null;
  lastError: string | null;

  connect: () => Promise<void>;
  disconnect: () => void;
  trySilentReconnect: () => Promise<void>;
  setSheetSyncEnabled: (enabled: boolean) => void;
  setDriveBackupEnabled: (enabled: boolean) => void;
  syncSheetNow: (jobs: Job[], companies: Company[]) => Promise<void>;
  runDriveBackupIfDue: () => Promise<void>;
  backupNow: () => Promise<void>;
  restoreFromDrive: () => Promise<{ restored: boolean }>;
}

export const useMicrosoftStore = create<MicrosoftState>((set, get) => ({
  isConfigured: isMicrosoftConfigured,
  isConnected: false,
  isConnecting: false,
  workbookItemId: localStorage.getItem(LS_WORKBOOK_ITEM_ID),
  workbookUrl: localStorage.getItem(LS_WORKBOOK_URL),
  sheetSyncEnabled: localStorage.getItem(LS_SHEET_SYNC_ENABLED) !== 'false',
  driveBackupEnabled: localStorage.getItem(LS_DRIVE_BACKUP_ENABLED) !== 'false',
  lastSheetSyncAt: localStorage.getItem(LS_LAST_SHEET_SYNC),
  lastDriveBackupAt: localStorage.getItem(LS_LAST_DRIVE_BACKUP),
  lastError: null,

  // Unlike Google's shared-by-default sheet (see useGoogleStore's
  // DEFAULT_SHEET_ID comment), Files.ReadWrite.AppFolder gives no
  // cross-account access — each Microsoft account gets its own private
  // app folder. So there's no "point at the one shared workbook" step;
  // ensureWorkbook() below just finds-or-creates this account's own
  // workbook and remembers its item id, so reconnecting never creates a
  // second one (per MICROSOFT_SETUP.md's "Connect" section).
  connect: async () => {
    set({ isConnecting: true, lastError: null });
    try {
      const { token } = await connectMicrosoft();
      const { itemId, webUrl } = await ensureWorkbook(token);
      localStorage.setItem(LS_WORKBOOK_ITEM_ID, itemId);
      localStorage.setItem(LS_WORKBOOK_URL, webUrl);
      localStorage.setItem(LS_WAS_CONNECTED, 'true');
      set({
        isConnected: true,
        isConnecting: false,
        workbookItemId: itemId,
        workbookUrl: webUrl,
      });
    } catch (err) {
      set({
        isConnecting: false,
        lastError: err instanceof Error ? err.message : 'Could not connect to Microsoft',
      });
      throw err;
    }
  },

  disconnect: () => {
    void disconnectMicrosoft();
    localStorage.setItem(LS_WAS_CONNECTED, 'false');
    set({ isConnected: false });
  },

  trySilentReconnect: async () => {
    if (localStorage.getItem(LS_WAS_CONNECTED) !== 'true') return;
    const ok = await trySilentMicrosoftReconnect();
    if (ok) set({ isConnected: true });
  },

  setSheetSyncEnabled: (enabled) => {
    localStorage.setItem(LS_SHEET_SYNC_ENABLED, String(enabled));
    set({ sheetSyncEnabled: enabled });
  },

  setDriveBackupEnabled: (enabled) => {
    localStorage.setItem(LS_DRIVE_BACKUP_ENABLED, String(enabled));
    set({ driveBackupEnabled: enabled });
  },

  syncSheetNow: async (jobs, companies) => {
    const { isConnected, sheetSyncEnabled } = get();
    if (!isConnected || !sheetSyncEnabled) return;
    const token = await getSilentToken();
    if (!token) {
      set({ isConnected: false });
      return;
    }
    try {
      let { workbookItemId } = get();
      if (!workbookItemId) {
        const { itemId, webUrl } = await ensureWorkbook(token);
        localStorage.setItem(LS_WORKBOOK_ITEM_ID, itemId);
        localStorage.setItem(LS_WORKBOOK_URL, webUrl);
        workbookItemId = itemId;
        set({ workbookItemId: itemId, workbookUrl: webUrl });
      }
      await syncJobsToWorkbook(token, workbookItemId, jobs, companies);
      const stamp = new Date().toISOString();
      localStorage.setItem(LS_LAST_SHEET_SYNC, stamp);
      set({ lastSheetSyncAt: stamp, lastError: null });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'Excel sync failed' });
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
    if (!get().isConnected) throw new Error('Connect a Microsoft account first');
    const token = await getSilentToken();
    if (!token) {
      set({ isConnected: false });
      throw new Error('Microsoft session expired — reconnect and try again');
    }
    try {
      const payload = await downloadBackupFromOneDrive(token);
      if (!payload) return { restored: false };
      await importBackupPayload(payload);
      set({ lastError: null });
      return { restored: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OneDrive restore failed';
      set({ lastError: message });
      throw err;
    }
  },
}));

async function runBackup(set: (partial: Partial<MicrosoftState>) => void): Promise<void> {
  const token = await getSilentToken();
  if (!token) {
    set({ isConnected: false });
    return;
  }
  try {
    const payload = await buildBackupPayload();
    await uploadBackupToOneDrive(token, payload);
    const stamp = new Date().toISOString();
    localStorage.setItem(LS_LAST_DRIVE_BACKUP, stamp);
    set({ lastDriveBackupAt: stamp, lastError: null });
  } catch (err) {
    set({ lastError: err instanceof Error ? err.message : 'OneDrive backup failed' });
  }
}
