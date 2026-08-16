import { useEffect } from 'react';
import { useDocketStore } from '@/store/useDocketStore';
import { getAttentionCount } from '@/lib/utils';

// Keeps the app icon's badge count (the little red number on the home
// screen icon once installed as a PWA) in sync with things due today —
// deadlines, interviews, recruiter follow-ups. This is what makes the
// installability work added earlier actually useful day-to-day: instead
// of having to open the app to find out something's due, it shows on the
// icon itself, the same way a mail app shows unread count.
//
// The Badging API (setAppBadge/clearAppBadge) is Chromium/Edge only —
// unsupported browsers (Firefox, Safari on iOS) just no-op here. Nothing
// breaks; the count is still shown in-app (see the dot on the nav's Home
// entry) for those cases.
export function useAppBadge() {
  const jobs = useDocketStore((s) => s.jobs);
  const recruiters = useDocketStore((s) => s.recruiters);

  const count = getAttentionCount(jobs, recruiters);

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge || !nav.clearAppBadge) return;
    if (count > 0) {
      nav.setAppBadge(count).catch(() => {});
    } else {
      nav.clearAppBadge().catch(() => {});
    }
  }, [count]);

  return count;
}
