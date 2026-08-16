import { useEffect, useState } from 'react';
import { Mail, RefreshCw, Check, X, AlertCircle } from 'lucide-react';
import { useDocketStore } from '@/store/useDocketStore';
import { useGoogleStore } from '@/store/useGoogleStore';
import { useToastStore } from '@/store/useToastStore';
import { STATUS_LABELS, type KanbanStatus } from '@/types/models';
import { SIGNAL_LABELS, type InboxSignal, type SignalType } from '@/lib/gmailScan';
import { cn } from '@/lib/utils';

// Emails a person has already looked at and decided aren't worth acting
// on stay dismissed across sessions - otherwise the same newsletter or
// false-positive match would keep resurfacing on every visit to Digest.
const DISMISSED_KEY = 'docket-inbox-signal-dismissed';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

const SIGNAL_STATUS: Record<SignalType, KanbanStatus> = {
  interview: 'interview',
  offer: 'offer',
  rejection: 'rejected',
};

export function InboxSignals() {
  const jobs = useDocketStore((s) => s.jobs);
  const companies = useDocketStore((s) => s.companies);
  const recruiters = useDocketStore((s) => s.recruiters);
  const updateJob = useDocketStore((s) => s.updateJob);
  const addTimelineEvent = useDocketStore((s) => s.addTimelineEvent);

  const isConfigured = useGoogleStore((s) => s.isConfigured);
  const isConnected = useGoogleStore((s) => s.isConnected);
  const connect = useGoogleStore((s) => s.connect);
  const scanInbox = useGoogleStore((s) => s.scanInbox);

  const [signals, setSignals] = useState<InboxSignal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const found = await scanInbox(jobs, companies, recruiters);
      setSignals(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not scan inbox');
    } finally {
      setLoading(false);
    }
  }

  // Auto-scan once when the panel first mounts with an already-connected
  // account, so the digest is useful without an extra click on every
  // visit. Not configured / not connected just shows the connect prompt
  // instead.
  useEffect(() => {
    if (isConnected) void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  function dismiss(emailId: string) {
    const next = new Set(dismissed);
    next.add(emailId);
    setDismissed(next);
    saveDismissed(next);
  }

  async function confirm(signal: InboxSignal) {
    setApplyingId(signal.email.id);
    try {
      const status = SIGNAL_STATUS[signal.type];
      await updateJob(signal.job.id, { status });
      await addTimelineEvent(
        signal.job.id,
        'From inbox scan',
        `"${signal.email.subject}" from ${signal.email.fromName || signal.email.fromEmail}`,
      );
      useToastStore.getState().push({
        message: `Moved "${signal.job.position}" to ${STATUS_LABELS[status]}`,
        tone: 'success',
      });
      dismiss(signal.email.id);
    } finally {
      setApplyingId(null);
    }
  }

  if (!isConfigured) return null; // Google isn't set up on this deployment at all

  const visible = (signals ?? []).filter((s) => !dismissed.has(s.email.id));

  return (
    <div className="mt-4 rounded-lg border border-ink/10 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-panel">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold">
            <Mail className="h-4 w-4 text-brass" />
            Inbox Signals
          </h2>
          <p className="text-xs text-ink-faint">
            Recent emails that look like an interview, offer, or rejection
          </p>
        </div>
        {isConnected && (
          <button
            onClick={runScan}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            {loading ? 'Scanning…' : 'Rescan'}
          </button>
        )}
      </div>

      <div className="mt-4">
        {!isConnected ? (
          <div className="flex items-center justify-between rounded-md border border-dashed border-ink/15 px-4 py-3 dark:border-white/15">
            <p className="text-sm text-ink-soft dark:text-paper/70">
              Connect Gmail to scan your inbox for application updates.
            </p>
            <button
              onClick={() => void connect()}
              className="shrink-0 rounded-md bg-brass px-3 py-1.5 text-xs font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
            >
              Connect Gmail
            </button>
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-brick/30 bg-brick/5 px-3 py-2.5 text-xs text-brick">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        ) : loading && signals === null ? (
          <p className="py-6 text-center text-sm text-ink-faint">Scanning your inbox…</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">
            Nothing flagged right now. You're all caught up.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visible.map((signal) => (
              <div
                key={signal.email.id}
                className="flex items-start gap-3 rounded-md border border-brass/30 bg-brass/5 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink dark:text-paper">
                    {signal.job.position}{' '}
                    <span className="font-normal text-ink-faint">
                      · {SIGNAL_LABELS[signal.type]}
                    </span>
                  </p>
                  <p className="truncate text-xs text-ink-faint">
                    {signal.email.subject || '(no subject)'} - {signal.email.fromName || signal.email.fromEmail}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => confirm(signal)}
                    disabled={applyingId === signal.email.id}
                    title={`Move to ${STATUS_LABELS[SIGNAL_STATUS[signal.type]]}`}
                    className="flex items-center gap-1 rounded-md bg-brass px-2.5 py-1.5 text-xs font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] disabled:opacity-60"
                  >
                    <Check className="h-3 w-3" />
                    Update
                  </button>
                  <button
                    onClick={() => dismiss(signal.email.id)}
                    title="Not relevant"
                    className="rounded-md p-1.5 text-ink-faint hover:bg-ink/5 dark:hover:bg-white/5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
