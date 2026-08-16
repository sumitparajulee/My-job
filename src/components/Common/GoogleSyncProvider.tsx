import { useEffect, useRef } from 'react';
import { useDocketStore } from '@/store/useDocketStore';
import { useGoogleStore } from '@/store/useGoogleStore';

const SHEET_SYNC_DEBOUNCE_MS = 3000;
const DRIVE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // just how often we *check* if a day has passed

export function GoogleSyncProvider() {
  const isConfigured = useGoogleStore((s) => s.isConfigured);
  const trySilentReconnect = useGoogleStore((s) => s.trySilentReconnect);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Try to pick back up a previous connection with no popup, once on load.
  useEffect(() => {
    if (isConfigured) void trySilentReconnect();
  }, [isConfigured, trySilentReconnect]);

  // Live sheet sync: fires shortly after any job or company change.
  // Debounced so a burst of edits (drag-reorder, quick-add, bulk import)
  // collapses into one Sheets API call instead of one per row.
  useEffect(() => {
    if (!isConfigured) return;
    const unsubscribe = useDocketStore.subscribe((state, prevState) => {
      if (state.jobs === prevState.jobs && state.companies === prevState.companies) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const { jobs, companies } = useDocketStore.getState();
        void useGoogleStore.getState().syncSheetNow(jobs, companies);
      }, SHEET_SYNC_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isConfigured]);

  // Drive backup: no server-side scheduler here (see lib/googleAuth.ts),
  // so this is the closest approximation to "daily" — check periodically
  // while the app happens to be open, and let the store's own 24h
  // timestamp check decide whether a check actually triggers an upload.
  useEffect(() => {
    if (!isConfigured) return;
    void useGoogleStore.getState().runDriveBackupIfDue();
    const interval = setInterval(() => {
      void useGoogleStore.getState().runDriveBackupIfDue();
    }, DRIVE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isConfigured]);

  return null;
}
