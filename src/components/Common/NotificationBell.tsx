import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, Clock3, MailQuestion, Moon } from 'lucide-react';
import { useDocketStore } from '@/store/useDocketStore';
import { useUIStore } from '@/store/useUIStore';
import { getAttentionItems, type AttentionItem, type AttentionKind } from '@/lib/attention';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<AttentionKind, typeof Bell> = {
  interview_today: CalendarClock,
  deadline_today: Clock3,
  followup_due: MailQuestion,
  stale: Moon,
};

const KIND_TONE: Record<AttentionKind, string> = {
  interview_today: 'text-forest bg-forest/10',
  deadline_today: 'text-brick bg-brick/10',
  followup_due: 'text-brass bg-brass/10',
  stale: 'text-slate bg-slate/10',
};

export function NotificationBell() {
  const jobs = useDocketStore((s) => s.jobs);
  const recruiters = useDocketStore((s) => s.recruiters);
  const companies = useDocketStore((s) => s.companies);
  const openJobModal = useUIStore((s) => s.openJobModal);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => getAttentionItems(jobs, recruiters, companies), [jobs, recruiters, companies]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function handleSelect(item: AttentionItem) {
    setOpen(false);
    if (item.jobId) {
      const job = jobs.find((j) => j.id === item.jobId);
      if (job) openJobModal(job);
      return;
    }
    if (item.recruiterId) {
      navigate('/recruiters');
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${items.length ? ` (${items.length} need attention)` : ''}`}
        className="relative rounded-md p-2 text-ink-soft transition-colors hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
      >
        <Bell className="h-4 w-4" />
        {items.length > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brick px-1 font-mono text-[9px] font-semibold text-white">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-ink/10 bg-white shadow-xl dark:border-white/10 dark:bg-night-panel">
          <div className="border-b border-ink/10 px-4 py-3 dark:border-white/10">
            <h3 className="font-display text-sm font-semibold">Needs attention</h3>
            <p className="text-xs text-ink-faint">
              {items.length === 0 ? "You're all caught up" : `${items.length} thing${items.length === 1 ? '' : 's'} to look at`}
            </p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-faint">
                No overdue follow-ups, quiet applications, or things due today.
              </p>
            ) : (
              items.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="flex w-full items-start gap-2.5 border-b border-ink/5 px-4 py-2.5 text-left last:border-b-0 hover:bg-ink/5 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md', KIND_TONE[item.kind])}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-ink dark:text-paper">{item.title}</span>
                      <span className="block truncate text-xs text-ink-faint">{item.subtitle}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
