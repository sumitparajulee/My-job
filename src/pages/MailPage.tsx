import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import {
  Mail,
  MailX,
  RefreshCw,
  Search,
  ChevronLeft,
  Paperclip,
  Download,
  AlertCircle,
  PenSquare,
  Reply,
  ReplyAll,
  Forward,
} from 'lucide-react';
import { useGoogleStore } from '@/store/useGoogleStore';
import { useGmailInboxStore } from '@/store/useGmailInboxStore';
import { cn } from '@/lib/utils';
import { ComposeModal, type ComposeDraft } from '@/components/Mail/ComposeModal';

function formatListDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function MailPage() {
  const isConfigured = useGoogleStore((s) => s.isConfigured);
  const isConnected = useGoogleStore((s) => s.isConnected);
  const connect = useGoogleStore((s) => s.connect);
  const ownEmail = useGoogleStore((s) => s.notifyEmail);

  const messages = useGmailInboxStore((s) => s.messages);
  const nextPageToken = useGmailInboxStore((s) => s.nextPageToken);
  const loading = useGmailInboxStore((s) => s.loading);
  const loadingMore = useGmailInboxStore((s) => s.loadingMore);
  const error = useGmailInboxStore((s) => s.error);
  const query = useGmailInboxStore((s) => s.query);
  const selectedId = useGmailInboxStore((s) => s.selectedId);
  const selectedBody = useGmailInboxStore((s) => s.selectedBody);
  const bodyLoading = useGmailInboxStore((s) => s.bodyLoading);
  const bodyError = useGmailInboxStore((s) => s.bodyError);

  const loadInbox = useGmailInboxStore((s) => s.loadInbox);
  const loadMore = useGmailInboxStore((s) => s.loadMore);
  const setQuery = useGmailInboxStore((s) => s.setQuery);
  const search = useGmailInboxStore((s) => s.search);
  const selectMessage = useGmailInboxStore((s) => s.selectMessage);
  const clearSelection = useGmailInboxStore((s) => s.clearSelection);
  const saveAttachment = useGmailInboxStore((s) => s.saveAttachment);

  const [queryInput, setQueryInput] = useState(query);
  const [savingAttachmentId, setSavingAttachmentId] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ title: string; draft: ComposeDraft } | null>(null);

  useEffect(() => {
    if (isConnected && messages.length === 0 && !loading) void loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <MailX className="mx-auto h-8 w-8 text-ink-faint" />
        <h1 className="mt-3 font-display text-lg font-semibold">Mail isn't set up</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Add a Google OAuth client ID to enable Mail. See GOOGLE_SETUP.md in the repo.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <Mail className="mx-auto h-8 w-8 text-brass" />
        <h1 className="mt-3 font-display text-lg font-semibold">Connect Gmail</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Read your inbox right here in Docket - no need to switch apps.
        </p>
        <button
          onClick={() => void connect()}
          className="mt-4 rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
        >
          Connect Gmail
        </button>
      </div>
    );
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setQuery(queryInput);
    void search();
  }

  async function handleSelect(id: string) {
    await selectMessage(id);
  }

  async function handleSaveAttachment(attachmentId: string, filename: string, mimeType: string) {
    setSavingAttachmentId(attachmentId);
    try {
      await saveAttachment(attachmentId, filename, mimeType);
    } finally {
      setSavingAttachmentId(null);
    }
  }

  const selectedMessage = messages.find((m) => m.id === selectedId) ?? null;
  const sanitizedHtml = selectedBody?.html ? DOMPurify.sanitize(selectedBody.html, { ADD_ATTR: ['target'] }) : null;

  function parseAddressList(header: string): string[] {
    // Splits a raw "To"/"Cc" header on commas outside quoted display
    // names (so `"Doe, Jane" <jane@x.com>, bob@y.com` splits correctly).
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of header) {
      if (char === '"') inQuotes = !inQuotes;
      if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts.filter(Boolean);
  }

  function openNewCompose() {
    setCompose({
      title: 'New message',
      draft: { to: '', subject: '' },
    });
  }

  function openReply(all: boolean) {
    if (!selectedMessage) return;
    const subject = /^re:/i.test(selectedMessage.subject)
      ? selectedMessage.subject
      : `Re: ${selectedMessage.subject}`;
    const references = [selectedBody?.references, selectedBody?.messageIdHeader].filter(Boolean).join(' ');

    let cc: string | undefined;
    if (all && selectedBody) {
      const originalTo = parseAddressList(selectedBody.toHeader);
      const originalCc = parseAddressList(selectedBody.ccHeader);
      const others = [...originalTo, ...originalCc].filter(
        (addr) => !addr.toLowerCase().includes(ownEmail.toLowerCase()) && !addr.toLowerCase().includes(selectedMessage.fromEmail.toLowerCase()),
      );
      cc = others.length > 0 ? others.join(', ') : undefined;
    }

    setCompose({
      title: all ? 'Reply all' : 'Reply',
      draft: {
        to: selectedMessage.fromEmail,
        cc,
        subject,
        quotedHtml: sanitizedHtml ?? (selectedBody?.text ? selectedBody.text.replace(/\n/g, '<br>') : undefined),
        quotedFromLine: `On ${formatFullDate(selectedMessage.date)}, ${selectedMessage.fromName} wrote:`,
        threadId: selectedMessage.threadId,
        inReplyTo: selectedBody?.messageIdHeader ?? undefined,
        references: references || undefined,
      },
    });
  }

  function openForward() {
    if (!selectedMessage) return;
    const subject = /^fwd:/i.test(selectedMessage.subject)
      ? selectedMessage.subject
      : `Fwd: ${selectedMessage.subject}`;
    setCompose({
      title: 'Forward',
      draft: {
        to: '',
        subject,
        quotedHtml: sanitizedHtml ?? (selectedBody?.text ? selectedBody.text.replace(/\n/g, '<br>') : undefined),
        quotedFromLine: `---------- Forwarded message ----------\nFrom: ${selectedMessage.fromName} <${selectedMessage.fromEmail}>`,
      },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink/10 px-6 py-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-semibold">Mail</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={openNewCompose}
              className="flex items-center gap-1.5 rounded-md bg-brass px-3 py-1.5 text-xs font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
            >
              <PenSquare className="h-3.5 w-3.5" />
              Compose
            </button>
            <button
              onClick={() => void loadInbox()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        <form onSubmit={handleSearchSubmit} className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search mail (from:, subject:, has:attachment...)"
              className="w-full rounded-md border border-ink/10 bg-transparent py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brass dark:border-white/10"
            />
          </div>
        </form>
      </div>

      {error && (
        <div className="mx-6 mt-3 flex items-start gap-2 rounded-md border border-brick/30 bg-brick/5 px-3 py-2.5 text-xs text-brick">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Message list — hidden on mobile once a message is open */}
        <div
          className={cn(
            'w-full shrink-0 overflow-y-auto border-r border-ink/10 dark:border-white/10 md:w-80',
            selectedId && 'hidden md:block',
          )}
        >
          {loading && messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-faint">Loading your inbox…</p>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-faint">No messages found.</p>
          ) : (
            <>
              {messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => void handleSelect(m.id)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-ink/5 px-4 py-3 text-left transition-colors hover:bg-ink/5 dark:border-white/5 dark:hover:bg-white/5',
                    selectedId === m.id && 'bg-brass/10',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('truncate text-sm', m.unread ? 'font-semibold text-ink dark:text-paper' : 'text-ink-soft dark:text-paper/70')}>
                      {m.fromName}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-faint">{formatListDate(m.date)}</span>
                  </div>
                  <span className={cn('truncate text-xs', m.unread ? 'font-medium text-ink dark:text-paper' : 'text-ink-faint')}>
                    {m.subject}
                  </span>
                  <span className="truncate text-xs text-ink-faint">{m.snippet}</span>
                </button>
              ))}
              {nextPageToken && (
                <div className="p-3">
                  <button
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="w-full rounded-md border border-ink/10 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Reading pane */}
        <div className={cn('min-w-0 flex-1 overflow-y-auto', !selectedId && 'hidden md:block')}>
          {!selectedMessage ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-faint">
              Select a message to read it
            </div>
          ) : (
            <div className="p-6">
              <button
                onClick={clearSelection}
                className="mb-4 flex items-center gap-1 text-xs font-medium text-ink-faint hover:text-ink-soft md:hidden"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back to inbox
              </button>

              <h2 className="font-display text-lg font-semibold">{selectedMessage.subject}</h2>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-faint">
                <span className="font-medium text-ink-soft dark:text-paper/70">{selectedMessage.fromName}</span>
                <span>&lt;{selectedMessage.fromEmail}&gt;</span>
                <span className="ml-auto font-mono text-xs">{formatFullDate(selectedMessage.date)}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => openReply(false)}
                  className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                >
                  <Reply className="h-3.5 w-3.5" />
                  Reply
                </button>
                <button
                  onClick={() => openReply(true)}
                  className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                >
                  <ReplyAll className="h-3.5 w-3.5" />
                  Reply all
                </button>
                <button
                  onClick={openForward}
                  className="flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                >
                  <Forward className="h-3.5 w-3.5" />
                  Forward
                </button>
              </div>

              <div className="mt-5 border-t border-ink/10 pt-5 dark:border-white/10">
                {bodyLoading ? (
                  <p className="text-sm text-ink-faint">Loading message…</p>
                ) : bodyError ? (
                  <div className="flex items-start gap-2 rounded-md border border-brick/30 bg-brick/5 px-3 py-2.5 text-xs text-brick">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {bodyError}
                  </div>
                ) : sanitizedHtml ? (
                  <div
                    className="prose prose-sm max-w-none break-words dark:prose-invert"
                    // Sanitized above via DOMPurify before this ever gets set.
                    dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                  />
                ) : selectedBody?.text ? (
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm text-ink dark:text-paper">
                    {selectedBody.text}
                  </pre>
                ) : (
                  <p className="text-sm text-ink-faint">{selectedMessage.snippet}</p>
                )}
              </div>

              {selectedBody && selectedBody.attachments.length > 0 && (
                <div className="mt-6 border-t border-ink/10 pt-4 dark:border-white/10">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Attachments ({selectedBody.attachments.length})
                  </h3>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {selectedBody.attachments.map((att) => (
                      <button
                        key={att.attachmentId}
                        onClick={() => void handleSaveAttachment(att.attachmentId, att.filename, att.mimeType)}
                        disabled={savingAttachmentId === att.attachmentId}
                        className="flex items-center gap-2 rounded-md border border-ink/10 px-3 py-2 text-left text-xs text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1 truncate">{att.filename}</span>
                        <span className="shrink-0 text-ink-faint">{formatBytes(att.size)}</span>
                        <Download className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {compose && (
        <ComposeModal
          title={compose.title}
          draft={compose.draft}
          onClose={() => setCompose(null)}
          onSent={() => setCompose(null)}
        />
      )}
    </div>
  );
}
