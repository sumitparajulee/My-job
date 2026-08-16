import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Download,
  Upload,
  DatabaseBackup,
  Cloud,
  CloudOff,
  ExternalLink,
  RefreshCw,
  LogOut,
  UserCircle,
  Undo2,
  Mail,
  MailX,
  Send,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useGoogleStore } from '@/store/useGoogleStore';
import { useMicrosoftStore } from '@/store/useMicrosoftStore';
import { useZohoStore } from '@/store/useZohoStore';
import { useDocketStore } from '@/store/useDocketStore';
import {
  exportBackup,
  exportJobsCsv,
  exportJobsPdf,
  getLatestSafetySnapshot,
  importBackup,
  pullLatestFromCloud,
  restoreSafetySnapshot,
  resyncAllToCloud,
  type SafetySnapshotMeta,
} from '@/lib/backup';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <h1 className="font-display text-2xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-ink-faint">
        Backup and Security are wired up so far - dark mode/accent/etc. land in Phase 6.
      </p>

      <div className="mt-6 rounded-lg border border-ink/10 p-5 dark:border-white/10">
        <AccountSection />
      </div>

      <div className="mt-4 rounded-lg border border-ink/10 p-5 dark:border-white/10">
        <BackupSection />
      </div>

      <div className="mt-4 rounded-lg border border-ink/10 p-5 dark:border-white/10">
        <GoogleSection />
      </div>

      <div className="mt-4 rounded-lg border border-ink/10 p-5 dark:border-white/10">
        <GmailSection />
      </div>

      <div className="mt-4 rounded-lg border border-ink/10 p-5 dark:border-white/10">
        <MicrosoftSection />
      </div>

      <ZohoSection />

      <div className="mt-4 rounded-lg border border-ink/10 p-5 dark:border-white/10">
        <SecuritySection />
      </div>
    </div>
  );
}

function AccountSection() {
  const workspace = useSessionStore((s) => s.workspace);
  const status = useSessionStore((s) => s.status);
  const signOut = useSessionStore((s) => s.signOut);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  async function handleResync() {
    if (!workspace) return;
    setIsResyncing(true);
    try {
      const { pushed } = await resyncAllToCloud(workspace.id);
      useToastStore.getState().push({
        message: pushed === 0 ? 'Nothing to push — you\u2019re already caught up' : `Pushed ${pushed} item${pushed === 1 ? '' : 's'} to the cloud`,
        tone: 'success',
      });
    } catch (err) {
      useToastStore.getState().push({
        message: `Resync failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'danger',
      });
    } finally {
      setIsResyncing(false);
    }
  }

  async function handlePull() {
    if (!workspace) return;
    setIsPulling(true);
    try {
      const { pulled } = await pullLatestFromCloud(workspace.id);
      useToastStore.getState().push({
        message: pulled === 0 ? 'Nothing new in the cloud' : `Pulled ${pulled} item${pulled === 1 ? '' : 's'} from the cloud`,
        tone: 'success',
      });
    } catch (err) {
      useToastStore.getState().push({
        message: `Pull failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'danger',
      });
    } finally {
      setIsPulling(false);
    }
  }

  if (status === 'local-only') {
    return (
      <div>
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-ink-faint" />
          <h2 className="font-display text-base font-semibold">Account</h2>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          Sync isn't configured, so there's no account to sign out of - everything here lives only
          in this browser.
        </p>
      </div>
    );
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <UserCircle className="h-4 w-4 text-ink" />
        <h2 className="font-display text-base font-semibold">Account</h2>
      </div>

      {status === 'ready' ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <UserCircle className="h-9 w-9 text-ink-faint" />
            <div>
              <p className="text-sm font-medium">Signed in</p>
              {workspace && <p className="text-xs text-ink-faint">{workspace.name}</p>}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            You stay signed in across reloads on this device - only signing out below asks you
            to sign in with Google again.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleResync}
              disabled={isResyncing}
              title="Push everything saved on this device up to the cloud — use this if anything was added while sync was broken or offline"
              className="flex items-center gap-1.5 rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isResyncing && 'animate-spin')} />
              {isResyncing ? 'Pushing...' : 'Push local data to cloud'}
            </button>
            <button
              onClick={handlePull}
              disabled={isPulling}
              title="Fetch everything currently in the cloud and merge it into this device — use this if a device is missing data you know is already synced"
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5 -scale-x-100', isPulling && 'animate-spin')} />
              {isPulling ? 'Pulling...' : 'Pull latest from cloud'}
            </button>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-ink-faint">
          {status === 'connecting' ? 'Connecting...' : 'Not signed in.'}
        </p>
      )}
    </div>
  );
}

function BackupSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [latestSnapshot, setLatestSnapshot] = useState<SafetySnapshotMeta | null>(null);

  useEffect(() => {
    void getLatestSafetySnapshot().then(setLatestSnapshot);
  }, []);

  async function handleUndoRestore() {
    if (!latestSnapshot) return;
    const when = formatRelativeTime(new Date(latestSnapshot.createdAt).toISOString());
    if (!window.confirm(`Restore your data as it was ${when.toLowerCase()}, before the last restore? This replaces what's currently loaded.`)) {
      return;
    }
    setIsUndoing(true);
    try {
      await restoreSafetySnapshot(latestSnapshot.id);
      useToastStore.getState().push({ message: 'Restored to before the last import, reloading...', tone: 'success' });
      setTimeout(() => window.location.reload(), 800);
    } catch {
      useToastStore.getState().push({ message: 'Undo failed', tone: 'danger' });
      setIsUndoing(false);
    }
  }

  async function handleExport() {
    try {
      await exportBackup();
      useToastStore.getState().push({ message: 'Backup downloaded', tone: 'success' });
    } catch {
      useToastStore.getState().push({ message: 'Export failed', tone: 'danger' });
    }
  }

  async function handleExportCsv() {
    try {
      await exportJobsCsv();
      useToastStore.getState().push({ message: 'CSV downloaded', tone: 'success' });
    } catch {
      useToastStore.getState().push({ message: 'CSV export failed', tone: 'danger' });
    }
  }

  async function handleExportPdf() {
    try {
      await exportJobsPdf();
      useToastStore.getState().push({ message: 'PDF downloaded', tone: 'success' });
    } catch {
      useToastStore.getState().push({ message: 'PDF export failed', tone: 'danger' });
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsImporting(true);
    try {
      await importBackup(file);
      useToastStore.getState().push({
        message: 'Backup restored, reloading...',
        tone: 'success',
      });
      setTimeout(() => window.location.reload(), 800);
    } catch {
      useToastStore.getState().push({ message: 'Import failed - check the file', tone: 'danger' });
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <DatabaseBackup className="h-4 w-4 text-ink" />
        <h2 className="font-display text-base font-semibold">Backup</h2>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        Everything here lives only in this browser's storage. Export a backup regularly, or before
        clearing browser data / switching devices. Importing a backup or restoring from the cloud
        automatically snapshots what you had first, so you can undo it if it's the wrong file.
      </p>

      {latestSnapshot && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-ink/[0.03] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-ink-soft dark:text-paper/70">
            Data from before your last restore ({formatRelativeTime(new Date(latestSnapshot.createdAt).toISOString())}) is saved.
          </p>
          <button
            onClick={handleUndoRestore}
            disabled={isUndoing}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {isUndoing ? 'Undoing...' : 'Undo last restore'}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
        >
          <Download className="h-3.5 w-3.5" />
          Export backup
        </button>
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-1.5 rounded-md border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
        >
          <Download className="h-3.5 w-3.5" />
          Export as CSV
        </button>
        <button
          onClick={handleExportPdf}
          className="flex items-center gap-1.5 rounded-md border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
        >
          <Download className="h-3.5 w-3.5" />
          Export as PDF
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="flex items-center gap-1.5 rounded-md border border-ink/10 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
        >
          <Upload className="h-3.5 w-3.5" />
          {isImporting ? 'Restoring...' : 'Import backup'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function GoogleSection() {
  const isConfigured = useGoogleStore((s) => s.isConfigured);
  const isConnected = useGoogleStore((s) => s.isConnected);
  const isConnecting = useGoogleStore((s) => s.isConnecting);
  const sheetUrl = useGoogleStore((s) => s.sheetUrl);
  const sheetSyncEnabled = useGoogleStore((s) => s.sheetSyncEnabled);
  const driveBackupEnabled = useGoogleStore((s) => s.driveBackupEnabled);
  const lastSheetSyncAt = useGoogleStore((s) => s.lastSheetSyncAt);
  const lastDriveBackupAt = useGoogleStore((s) => s.lastDriveBackupAt);
  const driveFolderId = useGoogleStore((s) => s.driveFolderId);
  const lastError = useGoogleStore((s) => s.lastError);
  const connect = useGoogleStore((s) => s.connect);
  const disconnect = useGoogleStore((s) => s.disconnect);
  const setSheetSyncEnabled = useGoogleStore((s) => s.setSheetSyncEnabled);
  const setDriveBackupEnabled = useGoogleStore((s) => s.setDriveBackupEnabled);
  const syncSheetNow = useGoogleStore((s) => s.syncSheetNow);
  const backupNow = useGoogleStore((s) => s.backupNow);
  const restoreFromDrive = useGoogleStore((s) => s.restoreFromDrive);

  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (lastError) {
      useToastStore.getState().push({ message: lastError, tone: 'danger' });
    }
  }, [lastError]);

  if (!isConfigured) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <CloudOff className="h-4 w-4 text-ink-faint" />
          <h2 className="font-display text-base font-semibold">Google sync</h2>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          Not set up yet - add a Google OAuth client ID to enable Drive backups and live Sheets
          sync. See GOOGLE_SETUP.md in the repo for the walkthrough.
        </p>
      </div>
    );
  }

  async function handleConnect() {
    try {
      await connect();
      useToastStore.getState().push({ message: 'Connected to Google', tone: 'success' });
    } catch {
      // connect() already stores the error; the effect above turns it into a toast.
    }
  }

  async function handleSyncNow() {
    setIsSyncingNow(true);
    const { jobs, companies } = useDocketStore.getState();
    await syncSheetNow(jobs, companies);
    setIsSyncingNow(false);
  }

  async function handleBackupNow() {
    setIsBackingUp(true);
    await backupNow();
    setIsBackingUp(false);
  }

  async function handleRestoreFromDrive() {
    setIsRestoring(true);
    try {
      const { restored } = await restoreFromDrive();
      if (restored) {
        useToastStore.getState().push({ message: 'Restored from Drive, reloading...', tone: 'success' });
        setTimeout(() => window.location.reload(), 800);
      } else {
        useToastStore.getState().push({ message: 'No Drive backup found on this account', tone: 'danger' });
      }
    } catch (err) {
      useToastStore.getState().push({
        message: `Restore failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'danger',
      });
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        {isConnected ? (
          <Cloud className="h-4 w-4 text-forest" />
        ) : (
          <CloudOff className="h-4 w-4 text-ink-faint" />
        )}
        <h2 className="font-display text-base font-semibold">Google sync</h2>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        {isConnected
          ? 'Connected. Docket can only see files it creates itself - a dedicated "Docket Backups" folder and one tracking spreadsheet. Nothing else in your Drive.'
          : 'Connect a Google account to enable daily Drive backups and a live Sheets copy of every job. This same connection also powers Gmail below.'}
      </p>

      {!isConnected ? (
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="mt-4 flex items-center gap-1.5 rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          <Cloud className="h-3.5 w-3.5" />
          {isConnecting ? 'Connecting...' : 'Connect Google account'}
        </button>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">Live sheet sync</span>
              <span className="block text-xs text-ink-faint">
                Every job, updated shortly after any change - last synced {formatRelativeTime(lastSheetSyncAt)}
              </span>
            </span>
            <input
              type="checkbox"
              checked={sheetSyncEnabled}
              onChange={(e) => setSheetSyncEnabled(e.target.checked)}
              className="h-4 w-4 accent-brass"
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">Daily Drive backup</span>
              <span className="block text-xs text-ink-faint">
                Full JSON snapshot, once every 24h while the app is open - last backup{' '}
                {formatRelativeTime(lastDriveBackupAt)}
              </span>
            </span>
            <input
              type="checkbox"
              checked={driveBackupEnabled}
              onChange={(e) => setDriveBackupEnabled(e.target.checked)}
              className="h-4 w-4 accent-brass"
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            {sheetUrl ? (
              <a
                href={sheetUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
              >
                <ExternalLink className="h-3 w-3" />
                Open sheet
              </a>
            ) : null}
            {driveFolderId ? (
              <a
                href={`https://drive.google.com/drive/folders/${driveFolderId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
              >
                <ExternalLink className="h-3 w-3" />
                Open backup folder
              </a>
            ) : null}
            <button
              onClick={handleSyncNow}
              disabled={isSyncingNow || !sheetSyncEnabled}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncingNow ? 'animate-spin' : ''}`} />
              Sync now
            </button>
            <button
              onClick={handleBackupNow}
              disabled={isBackingUp || !driveBackupEnabled}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <DatabaseBackup className={`h-3 w-3 ${isBackingUp ? 'animate-pulse' : ''}`} />
              Back up now
            </button>
            <button
              onClick={handleRestoreFromDrive}
              disabled={isRestoring}
              title="Download the most recent Drive backup and merge it into this device"
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <RefreshCw className={`h-3 w-3 -scale-x-100 ${isRestoring ? 'animate-spin' : ''}`} />
              {isRestoring ? 'Restoring...' : 'Restore from Drive'}
            </button>
            <button
              onClick={disconnect}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <CloudOff className="h-3 w-3" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GmailSection() {
  const isConfigured = useGoogleStore((s) => s.isConfigured);
  const isConnected = useGoogleStore((s) => s.isConnected);
  const isConnecting = useGoogleStore((s) => s.isConnecting);
  const notifyOnJobChange = useGoogleStore((s) => s.notifyOnJobChange);
  const notifyEmail = useGoogleStore((s) => s.notifyEmail);
  const lastError = useGoogleStore((s) => s.lastError);
  const connect = useGoogleStore((s) => s.connect);
  const disconnect = useGoogleStore((s) => s.disconnect);
  const setNotifyOnJobChange = useGoogleStore((s) => s.setNotifyOnJobChange);
  const setNotifyEmail = useGoogleStore((s) => s.setNotifyEmail);
  const sendMail = useGoogleStore((s) => s.sendMail);

  const [isSendingTest, setIsSendingTest] = useState(false);

  useEffect(() => {
    if (lastError) {
      useToastStore.getState().push({ message: lastError, tone: 'danger' });
    }
  }, [lastError]);

  if (!isConfigured) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <MailX className="h-4 w-4 text-ink-faint" />
          <h2 className="font-display text-base font-semibold">Gmail</h2>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          Not set up yet - add a Google OAuth client ID to enable Gmail. See GOOGLE_SETUP.md in
          the repo for the walkthrough.
        </p>
      </div>
    );
  }

  async function handleConnect() {
    try {
      await connect();
      useToastStore.getState().push({ message: 'Connected to Gmail', tone: 'success' });
    } catch {
      // connect() already stores the error; the effect above turns it into a toast.
    }
  }

  async function handleSendTest() {
    setIsSendingTest(true);
    try {
      await sendMail(
        notifyEmail,
        'Docket test email',
        '<p>This is a test email from Docket - your Gmail connection is working.</p>',
      );
      useToastStore.getState().push({ message: `Test email sent to ${notifyEmail}`, tone: 'success' });
    } catch {
      // sendMail() already stores the error; the effect above turns it into a toast.
    } finally {
      setIsSendingTest(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        {isConnected ? (
          <Mail className="h-4 w-4 text-forest" />
        ) : (
          <MailX className="h-4 w-4 text-ink-faint" />
        )}
        <h2 className="font-display text-base font-semibold">Gmail</h2>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        {isConnected
          ? 'Connected. Docket can send mail as you for job-change notifications and scan your inbox on the Digest page for interview/offer/rejection updates. Nothing else in your inbox is touched.'
          : 'Connect Gmail to get notified when a job changes and to scan your inbox for application updates on the Digest page.'}
      </p>

      {!isConnected ? (
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="mt-4 flex items-center gap-1.5 rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          <Mail className="h-3.5 w-3.5" />
          {isConnecting ? 'Connecting...' : 'Connect Gmail'}
        </button>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">Email me on every job change</span>
              <span className="block text-xs text-ink-faint">
                Sends a Gmail notification whenever a job entry is added, edited, or deleted
              </span>
            </span>
            <input
              type="checkbox"
              checked={notifyOnJobChange}
              onChange={(e) => setNotifyOnJobChange(e.target.checked)}
              className="h-4 w-4 accent-brass"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium">Notify address</span>
            <input
              type="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="sumitparazulee@gmail.com"
              className="mt-1 w-full rounded-md border border-ink/10 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-brass dark:border-white/10"
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={handleSendTest}
              disabled={isSendingTest || !notifyEmail}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <Send className={`h-3 w-3 ${isSendingTest ? 'animate-pulse' : ''}`} />
              {isSendingTest ? 'Sending...' : 'Send test email'}
            </button>
            <button
              onClick={disconnect}
              title="Disconnects the shared Google connection - also disables Drive backup and Sheets sync"
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <MailX className="h-3 w-3" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MicrosoftSection() {
  const isConfigured = useMicrosoftStore((s) => s.isConfigured);
  const isConnected = useMicrosoftStore((s) => s.isConnected);
  const isConnecting = useMicrosoftStore((s) => s.isConnecting);
  const workbookUrl = useMicrosoftStore((s) => s.workbookUrl);
  const sheetSyncEnabled = useMicrosoftStore((s) => s.sheetSyncEnabled);
  const driveBackupEnabled = useMicrosoftStore((s) => s.driveBackupEnabled);
  const lastSheetSyncAt = useMicrosoftStore((s) => s.lastSheetSyncAt);
  const lastDriveBackupAt = useMicrosoftStore((s) => s.lastDriveBackupAt);
  const lastError = useMicrosoftStore((s) => s.lastError);
  const connect = useMicrosoftStore((s) => s.connect);
  const disconnect = useMicrosoftStore((s) => s.disconnect);
  const setSheetSyncEnabled = useMicrosoftStore((s) => s.setSheetSyncEnabled);
  const setDriveBackupEnabled = useMicrosoftStore((s) => s.setDriveBackupEnabled);
  const syncSheetNow = useMicrosoftStore((s) => s.syncSheetNow);
  const backupNow = useMicrosoftStore((s) => s.backupNow);
  const restoreFromDrive = useMicrosoftStore((s) => s.restoreFromDrive);

  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (lastError) {
      useToastStore.getState().push({ message: lastError, tone: 'danger' });
    }
  }, [lastError]);

  if (!isConfigured) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <CloudOff className="h-4 w-4 text-ink-faint" />
          <h2 className="font-display text-base font-semibold">Microsoft sync</h2>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          Not set up yet - add an Azure AD app client ID to enable OneDrive backups and live
          Excel sync. See MICROSOFT_SETUP.md in the repo for the walkthrough.
        </p>
      </div>
    );
  }

  async function handleConnect() {
    try {
      await connect();
      useToastStore.getState().push({ message: 'Connected to Microsoft', tone: 'success' });
    } catch {
      // connect() already stores the error; the effect above turns it into a toast.
    }
  }

  async function handleSyncNow() {
    setIsSyncingNow(true);
    const { jobs, companies } = useDocketStore.getState();
    await syncSheetNow(jobs, companies);
    setIsSyncingNow(false);
  }

  async function handleBackupNow() {
    setIsBackingUp(true);
    await backupNow();
    setIsBackingUp(false);
  }

  async function handleRestoreFromDrive() {
    setIsRestoring(true);
    try {
      const { restored } = await restoreFromDrive();
      if (restored) {
        useToastStore.getState().push({ message: 'Restored from OneDrive, reloading...', tone: 'success' });
        setTimeout(() => window.location.reload(), 800);
      } else {
        useToastStore.getState().push({ message: 'No OneDrive backup found on this account', tone: 'danger' });
      }
    } catch (err) {
      useToastStore.getState().push({
        message: `Restore failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'danger',
      });
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        {isConnected ? (
          <Cloud className="h-4 w-4 text-forest" />
        ) : (
          <CloudOff className="h-4 w-4 text-ink-faint" />
        )}
        <h2 className="font-display text-base font-semibold">Microsoft sync</h2>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        {isConnected
          ? 'Connected. Docket can only see files it creates itself, inside a dedicated "Apps/Docket" app folder - nothing else already in your OneDrive.'
          : 'Connect a Microsoft account to enable daily OneDrive backups and a live Excel copy of every job.'}
      </p>

      {!isConnected ? (
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="mt-4 flex items-center gap-1.5 rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          <Cloud className="h-3.5 w-3.5" />
          {isConnecting ? 'Connecting...' : 'Connect Microsoft account'}
        </button>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">Live Excel sync</span>
              <span className="block text-xs text-ink-faint">
                Every job, updated shortly after any change - last synced {formatRelativeTime(lastSheetSyncAt)}
              </span>
            </span>
            <input
              type="checkbox"
              checked={sheetSyncEnabled}
              onChange={(e) => setSheetSyncEnabled(e.target.checked)}
              className="h-4 w-4 accent-brass"
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">Daily OneDrive backup</span>
              <span className="block text-xs text-ink-faint">
                Full JSON snapshot, once every 24h while the app is open - last backup{' '}
                {formatRelativeTime(lastDriveBackupAt)}
              </span>
            </span>
            <input
              type="checkbox"
              checked={driveBackupEnabled}
              onChange={(e) => setDriveBackupEnabled(e.target.checked)}
              className="h-4 w-4 accent-brass"
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            {workbookUrl ? (
              <a
                href={workbookUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
              >
                <ExternalLink className="h-3 w-3" />
                Open workbook
              </a>
            ) : null}
            <button
              onClick={handleSyncNow}
              disabled={isSyncingNow || !sheetSyncEnabled}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncingNow ? 'animate-spin' : ''}`} />
              Sync now
            </button>
            <button
              onClick={handleBackupNow}
              disabled={isBackingUp || !driveBackupEnabled}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <DatabaseBackup className={`h-3 w-3 ${isBackingUp ? 'animate-pulse' : ''}`} />
              Back up now
            </button>
            <button
              onClick={handleRestoreFromDrive}
              disabled={isRestoring}
              title="Download the most recent OneDrive backup and merge it into this device"
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <RefreshCw className={`h-3 w-3 -scale-x-100 ${isRestoring ? 'animate-spin' : ''}`} />
              {isRestoring ? 'Restoring...' : 'Restore from OneDrive'}
            </button>
            <button
              onClick={disconnect}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <CloudOff className="h-3 w-3" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ZohoSection() {
  const isConfigured = useZohoStore((s) => s.isConfigured);
  const isConnected = useZohoStore((s) => s.isConnected);
  const isConnecting = useZohoStore((s) => s.isConnecting);
  const email = useZohoStore((s) => s.email);
  const autoCheckReplies = useZohoStore((s) => s.autoCheckReplies);
  const lastError = useZohoStore((s) => s.lastError);
  const connect = useZohoStore((s) => s.connect);
  const disconnect = useZohoStore((s) => s.disconnect);
  const setAutoCheckReplies = useZohoStore((s) => s.setAutoCheckReplies);

  useEffect(() => {
    if (lastError) {
      useToastStore.getState().push({ message: lastError, tone: 'danger' });
    }
  }, [lastError]);

  if (!isConfigured) {
    return null;
  }

  async function handleConnect() {
    try {
      await connect();
      useToastStore.getState().push({ message: 'Connected to Zoho Mail', tone: 'success' });
    } catch {
      // connect() already stores the error; the effect above turns it into a toast.
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-ink/10 p-5 dark:border-white/10">
      <div className="flex items-center gap-2">
        {isConnected ? (
          <Cloud className="h-4 w-4 text-forest" />
        ) : (
          <CloudOff className="h-4 w-4 text-ink-faint" />
        )}
        <h2 className="font-display text-base font-semibold">Zoho Mail</h2>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        {isConnected
          ? `Connected as ${email}. Docket can send mail as you and search your inbox for replies from a specific recruiter - nothing else in your account.`
          : "Connect a Zoho Mail account to send mail and check for recruiter replies from Docket. Session lasts about an hour - Zoho's token flow doesn't offer a silent reconnect, so you'll click Connect again next time you open Docket."}
      </p>

      {!isConnected ? (
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="mt-4 flex items-center gap-1.5 rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          <Cloud className="h-3.5 w-3.5" />
          {isConnecting ? 'Connecting...' : 'Connect Zoho Mail'}
        </button>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">Auto-detect recruiter replies</span>
              <span className="block text-xs text-ink-faint">
                Lets the "Check for reply" action on recruiter cards run without asking each time
              </span>
            </span>
            <input
              type="checkbox"
              checked={autoCheckReplies}
              onChange={(e) => setAutoCheckReplies(e.target.checked)}
              className="h-4 w-4 accent-brass"
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={disconnect}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <CloudOff className="h-3 w-3" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SecuritySection() {
  const hasPassword = useAuthStore((s) => s.hasPassword);
  return (
    <div>
      <div className="flex items-center gap-2">
        {hasPassword ? (
          <ShieldCheck className="h-4 w-4 text-forest" />
        ) : (
          <ShieldOff className="h-4 w-4 text-ink-faint" />
        )}
        <h2 className="font-display text-base font-semibold">Lock screen</h2>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        A password gates the app UI on this device. It doesn't encrypt what's stored in
        IndexedDB - treat it as a screen lock, not data-at-rest encryption.
      </p>

      <div className="mt-4">{hasPassword ? <ChangeOrRemove /> : <CreatePassword />}</div>
    </div>
  );
}

function CreatePassword() {
  const setup = useAuthStore((s) => s.setup);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setLocalError('Use at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setLocalError("Passwords don't match");
      return;
    }
    await setup(password);
    setLocalError(null);
    setPassword('');
    setConfirm('');
    useToastStore.getState().push({ message: 'Lock screen enabled', tone: 'success' });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        className="input"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm password"
        className="input"
      />
      {localError && <p className="text-xs text-brick">{localError}</p>}
      <button
        type="submit"
        className="flex items-center gap-1.5 rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Enable lock screen
      </button>
    </form>
  );
}

function ChangeOrRemove() {
  const changePassword = useAuthStore((s) => s.changePassword);
  const removePassword = useAuthStore((s) => s.removePassword);
  const error = useAuthStore((s) => s.error);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [mode, setMode] = useState<'change' | 'remove'>('change');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'remove') {
      const ok = await removePassword(current);
      if (ok) {
        useToastStore.getState().push({ message: 'Lock screen disabled', tone: 'default' });
        setCurrent('');
      }
      return;
    }
    if (next.length < 6) return;
    const ok = await changePassword(current, next);
    if (ok) {
      useToastStore.getState().push({ message: 'Password updated', tone: 'success' });
      setCurrent('');
      setNext('');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        placeholder="Current password"
        className="input"
      />
      {mode === 'change' && (
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="New password (min 6 characters)"
          className="input"
        />
      )}
      {error && <p className="text-xs text-brick">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
        >
          {mode === 'change' ? 'Update password' : 'Disable lock screen'}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'change' ? 'remove' : 'change')}
          className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
        >
          {mode === 'change' ? 'Disable instead' : 'Cancel'}
        </button>
      </div>
    </form>
  );
}
