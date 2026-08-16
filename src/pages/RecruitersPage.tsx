import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Users, Mail, Phone, Linkedin, Plus, Search, Building2, Send, RefreshCw } from 'lucide-react';
import type { Recruiter } from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { useZohoStore } from '@/store/useZohoStore';
import { RecruiterFormModal } from '@/components/RecruiterForm/RecruiterFormModal';
import { zohoComposeMailto } from '@/lib/zohoMail';
import { cn, formatDate } from '@/lib/utils';

function daysUntil(iso: string): number {
  const target = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyDot(days: number): string {
  if (days <= 2) return 'bg-brick';
  if (days <= 7) return 'bg-brass';
  return 'bg-slate';
}

function urgencyLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days}d`;
}

export function RecruitersPage() {
  const recruiters = useDocketStore((s) => s.recruiters);
  const companies = useDocketStore((s) => s.companies);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Recruiter | null | undefined>(undefined);
  const [checkingReplyId, setCheckingReplyId] = useState<string | null>(null);
  const isZohoConnected = useZohoStore((s) => s.isConnected);
  const checkForReplyFrom = useZohoStore((s) => s.checkForReplyFrom);

  async function handleCheckReply(recruiter: Recruiter) {
    if (!recruiter.email || checkingReplyId) return;
    setCheckingReplyId(recruiter.id);
    await checkForReplyFrom(recruiter.email);
    setCheckingReplyId(null);
  }

  const companyName = (id?: string) => companies.find((c) => c.id === id)?.name;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? recruiters.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.position?.toLowerCase().includes(q) ||
            companyName(r.companyId)?.toLowerCase().includes(q),
        )
      : recruiters;
    return [...list].sort((a, b) => {
      if (a.nextFollowUp && b.nextFollowUp) return a.nextFollowUp.localeCompare(b.nextFollowUp);
      if (a.nextFollowUp) return -1;
      if (b.nextFollowUp) return 1;
      return a.name.localeCompare(b.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruiters, companies, search]);

  const overview = useMemo(() => {
    const total = recruiters.filter((r) => !r.deletedAt).length;
    const dueToday = recruiters.filter((r) => !r.deletedAt && r.nextFollowUp && daysUntil(r.nextFollowUp) === 0).length;
    const overdue = recruiters.filter((r) => !r.deletedAt && r.nextFollowUp && daysUntil(r.nextFollowUp) < 0).length;
    return [
      { label: 'Total recruiters', value: total, icon: Users },
      { label: 'Due today', value: dueToday, icon: Send },
      { label: 'Overdue', value: overdue, icon: RefreshCw },
    ];
  }, [recruiters]);

  return (
    <div className="h-full overflow-auto px-6 pb-8 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Recruiters</h1>
          <p className="text-sm text-ink-faint">Everyone you're in touch with, and when to follow up</p>
        </div>
        <button
          onClick={() => setEditing(null)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-brass px-3.5 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          Add recruiter
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-5 shadow-card dark:bg-night-panel">
        <div className="grid grid-cols-3 gap-3">
          {overview.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center gap-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper-dim dark:bg-white/5">
                <Icon className="h-5 w-5 text-brass" />
              </span>
              <span className="font-display text-lg font-semibold leading-none">{value}</span>
              <span className="text-[11px] font-medium leading-tight text-ink-soft dark:text-paper/70">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mt-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recruiters..."
          className="input pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <Users className="h-8 w-8 text-ink-faint" strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold">
            {recruiters.length === 0 ? 'No recruiters yet' : 'No matches'}
          </p>
          <p className="max-w-xs text-sm text-ink-faint">
            {recruiters.length === 0
              ? "Add the people you're in touch with at each company, and when to follow up with them."
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recruiter) => {
            const days = recruiter.nextFollowUp ? daysUntil(recruiter.nextFollowUp) : null;
            return (
              <button
                key={recruiter.id}
                onClick={() => setEditing(recruiter)}
                className="flex flex-col gap-2 rounded-lg border border-ink/10 bg-white p-4 text-left shadow-card transition-colors hover:border-brass/40 dark:border-white/10 dark:bg-night-panel"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/10 font-display text-sm font-semibold text-ink">
                      {recruiter.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-semibold">{recruiter.name}</p>
                      {recruiter.position && (
                        <p className="truncate text-xs text-ink-faint">{recruiter.position}</p>
                      )}
                    </div>
                  </div>
                </div>

                {companyName(recruiter.companyId) && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{companyName(recruiter.companyId)}</span>
                  </div>
                )}

                {(recruiter.email || recruiter.phone || recruiter.linkedin) && (
                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-ink-faint">
                    {recruiter.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> Email
                      </span>
                    )}
                    {recruiter.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> Phone
                      </span>
                    )}
                    {recruiter.linkedin && (
                      <span className="flex items-center gap-1">
                        <Linkedin className="h-3 w-3" /> LinkedIn
                      </span>
                    )}
                  </div>
                )}

                {recruiter.email && (
                  <div className="mt-0.5 flex items-center gap-2">
                    <a
                      href={zohoComposeMailto(recruiter.email)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 rounded-md border border-ink/10 px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                    >
                      <Send className="h-3 w-3" />
                      Draft in Zoho Mail
                    </a>
                    {isZohoConnected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCheckReply(recruiter);
                        }}
                        disabled={checkingReplyId === recruiter.id}
                        className="flex items-center gap-1 rounded-md border border-ink/10 px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                      >
                        <RefreshCw
                          className={cn('h-3 w-3', checkingReplyId === recruiter.id && 'animate-spin')}
                        />
                        Check for reply
                      </button>
                    )}
                  </div>
                )}

                {recruiter.nextFollowUp && days !== null && (
                  <div
                    className={cn(
                      'mt-1 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
                      days <= 2
                        ? 'border-brick/30 bg-brick/5 text-brick'
                        : days <= 7
                          ? 'border-brass/30 bg-brass/5 text-brass-dim'
                          : 'border-ink/10 text-ink-faint dark:border-white/10',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', urgencyDot(days))} />
                    Follow up {formatDate(recruiter.nextFollowUp)} - {urgencyLabel(days)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {editing !== undefined && (
          <RecruiterFormModal recruiter={editing} onClose={() => setEditing(undefined)} />
        )}
      </AnimatePresence>
    </div>
  );
}
