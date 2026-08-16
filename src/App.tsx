import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/Layout/Sidebar';
import { TopBar } from '@/components/Layout/TopBar';
import { BottomNav } from '@/components/Layout/BottomNav';
import { Toaster } from '@/components/Common/Toaster';
import { CommandPalette } from '@/components/Common/CommandPalette';
import { LockScreen } from '@/components/Common/LockScreen';
import { AuthGate } from '@/components/Common/AuthGate';
import { SyncProvider } from '@/components/Common/SyncProvider';
import { GoogleSyncProvider } from '@/components/Common/GoogleSyncProvider';
import { MicrosoftSyncProvider } from '@/components/Common/MicrosoftSyncProvider';
import { JobFormModal } from '@/components/JobForm/JobFormModal';
import { useAppBadge } from '@/hooks/useAppBadge';
import { useDocketStore } from '@/store/useDocketStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';
import { isSyncConfigured } from '@/lib/firebase';
import { KanbanPage } from '@/pages/KanbanPage';

// Every route except the board (the default landing page — should never
// wait on a network round-trip) is loaded on demand. Each of these pulls
// in its own heavy dependency (Recharts for Analytics, jsPDF for
// Documents/exports, etc.) — splitting them out is what actually shrinks
// the ~2.4MB single-chunk bundle flagged by `vite build`. React Router
// only renders the <Route> whose path matches, so only the page the
// person actually navigates to ever downloads.
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const DocumentsPage = lazy(() => import('@/pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const CompaniesPage = lazy(() => import('@/pages/CompaniesPage').then((m) => ({ default: m.CompaniesPage })));
const RecruitersPage = lazy(() => import('@/pages/RecruitersPage').then((m) => ({ default: m.RecruitersPage })));
const CalendarPage = lazy(() => import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const DigestPage = lazy(() => import('@/pages/DigestPage').then((m) => ({ default: m.DigestPage })));
const MailPage = lazy(() => import('@/pages/MailPage').then((m) => ({ default: m.MailPage })));
const WebTabsPage = lazy(() => import('@/pages/WebTabsPage').then((m) => ({ default: m.WebTabsPage })));

// The Zoho OAuth popup briefly loads this exact path with the token in
// the URL fragment. useZohoStore's connect() is already polling the
// popup's location from the opener window and will close it within
// ~300ms — this route only exists so that brief moment shows a plain
// "Connecting…" message instead of flashing the lock screen or full app.
const ZOHO_CALLBACK_PATH = '/zoho-callback';

function ZohoCallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-paper font-mono text-sm text-ink-faint dark:bg-night">
      Connecting to Zoho Mail…
    </div>
  );
}

// Shown instead of the app when this deployment isn't localhost but
// Firebase sync isn't configured — see the fail-closed guard in App().
// Deliberately gives no way through: the fix is env vars on the host,
// not a client-side bypass.
function SyncNotConfiguredScreen() {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-brass-soft via-brass to-brass-dim p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-night-panel">
        <h1 className="font-display text-lg font-semibold">Sign-in isn't configured</h1>
        <p className="mt-2 text-sm text-ink-faint">
          This deployment is missing its Firebase configuration, so the sign-in check
          can't run. Set the <code className="text-xs">VITE_FIREBASE_*</code> environment
          variables on the host and redeploy — see FIREBASE_SETUP.md.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const isReady = useDocketStore((s) => s.isReady);
  const isUnlocked = useAuthStore((s) => s.isUnlocked);
  const sessionInit = useSessionStore((s) => s.init);
  const sessionStatus = useSessionStore((s) => s.status);

  // Job modal lives here (not inside KanbanPage) so any page — Calendar,
  // Dashboard, a future search result — can call openJobModal() and get
  // the same modal, instead of each page needing its own copy of it.
  const jobModalTarget = useUIStore((s) => s.jobModalTarget);
  const closeJobModal = useUIStore((s) => s.closeJobModal);

  // Keeps the installed app's home-screen icon badge (and the in-app nav
  // dot, for platforms without badge support) in sync with what's due
  // today. See src/hooks/useAppBadge.ts.
  useAppBadge();

  useEffect(() => {
    // The Zoho popup briefly loads this same app bundle on
    // /zoho-callback, purely so useZohoStore's connect() (running in the
    // opener window) can poll popup.location.href for the token. Nothing
    // on this path needs a session, and kicking off sessionInit()'s
    // network calls in that short-lived popup context is what was
    // causing the "Failed to fetch" flash — skip it here.
    if (window.location.pathname === ZOHO_CALLBACK_PATH) return;
    sessionInit();
  }, [sessionInit]);

  // The Zoho OAuth popup briefly loads this exact path — short-circuit
  // before the lock screen / auth gate so it never has to deal with
  // either. Checked after all hooks above so this stays rules-of-hooks
  // safe even though it returns early.
  if (window.location.pathname === ZOHO_CALLBACK_PATH) return <ZohoCallback />;

  // SyncProvider owns calling useDocketStore's init() — in local-only mode
  // it does so immediately; with sync configured it waits for a signed-in
  // session and a chosen workspace first.
  //
  // Fail-closed guard: this deployment is meant to always run with Firebase
  // sync configured (that's the whole point of AuthGate's email lock). If
  // isSyncConfigured is false anywhere other than localhost, that almost
  // certainly means the VITE_FIREBASE_* env vars weren't set on the actual
  // host (a Vercel/Netlify project has its own env var config separate
  // from your local .env — a missing var there silently used to grant full
  // access to anyone with the URL, since AuthGate simply never rendered).
  // Refuse to run rather than fail open.
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isUnlocked) return <LockScreen />;
  if (!isSyncConfigured && !isLocalHost) return <SyncNotConfiguredScreen />;
  if (isSyncConfigured && sessionStatus !== 'ready') return <AuthGate />;

  return (
    <>
      <SyncProvider />
      <GoogleSyncProvider />
      <MicrosoftSyncProvider />
    <div className="flex h-screen w-screen overflow-hidden bg-paper dark:bg-night">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          {!isReady ? (
            <div className="flex h-full items-center justify-center text-ink-faint font-mono text-sm">
              Loading your docket…
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-ink-faint font-mono text-sm">
                  Loading…
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<KanbanPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/companies" element={<CompaniesPage />} />
                <Route path="/recruiters" element={<RecruitersPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/digest" element={<DigestPage />} />
                <Route path="/mail" element={<MailPage />} />
                <Route path="/web-tabs" element={<WebTabsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </Suspense>
          )}
        </main>
      </div>
      <BottomNav />
      <Toaster />
      <CommandPalette />
      <AnimatePresence>
        {jobModalTarget !== null && (
          <JobFormModal
            key={jobModalTarget === 'new' ? 'new' : jobModalTarget.id}
            job={jobModalTarget === 'new' ? null : jobModalTarget}
            onClose={closeJobModal}
          />
        )}
      </AnimatePresence>
    </div>
    </>
  );
}
