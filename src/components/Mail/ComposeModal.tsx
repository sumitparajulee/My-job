import { useRef, useState } from 'react';
import { X, Send, AlertCircle, ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import { useGmailInboxStore } from '@/store/useGmailInboxStore';

// Gmail's own hard cap on a single outgoing message (including
// headers and base64 attachment overhead) is 25MB. Leave headroom
// for the body/headers/base64 bloat (base64 adds ~37%) rather than
// cutting it exactly at 25MB of raw file bytes.
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // readAsDataURL yields "data:<mime>;base64,<data>" — keep only the data.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export interface ComposeDraft {
  to: string;
  cc?: string;
  subject: string;
  // Quoted HTML shown (read-only) beneath the compose body on a
  // reply/reply-all — not editable, just for context.
  quotedHtml?: string;
  quotedFromLine?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

interface ComposeModalProps {
  draft: ComposeDraft;
  title: string;
  onClose: () => void;
  onSent: () => void;
}

export function ComposeModal({ draft, title, onClose, onSent }: ComposeModalProps) {
  const sending = useGmailInboxStore((s) => s.sending);
  const sendError = useGmailInboxStore((s) => s.sendError);
  const sendMessage = useGmailInboxStore((s) => s.sendMessage);
  const clearSendError = useGmailInboxStore((s) => s.clearSendError);

  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc ?? '');
  const [showCc, setShowCc] = useState(Boolean(draft.cc));
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState('');
  const [showQuoted, setShowQuoted] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAttachmentBytes = files.reduce((sum, f) => sum + f.size, 0);

  function handleFilesPicked(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setAttachError(null);
    const incoming = Array.from(picked);
    const newTotal = totalAttachmentBytes + incoming.reduce((sum, f) => sum + f.size, 0);
    if (newTotal > MAX_TOTAL_ATTACHMENT_BYTES) {
      setAttachError(`Attachments can't exceed ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)} total (Gmail's own limit is 25MB per message).`);
      return;
    }
    setFiles((prev) => [...prev, ...incoming]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setAttachError(null);
  }

  async function handleSend() {
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    clearSendError();
    const bodyHtml = `<div>${body.replace(/\n/g, '<br>')}</div>${
      draft.quotedHtml
        ? `<br><blockquote style="margin:0 0 0 0.5em;padding-left:1em;border-left:2px solid #ccc;color:#666;">${
            draft.quotedFromLine ? `<p>${draft.quotedFromLine}</p>` : ''
          }${draft.quotedHtml}</blockquote>`
        : ''
    }`;

    let attachments: { filename: string; mimeType: string; base64Data: string }[] | undefined;
    if (files.length > 0) {
      setPreparingAttachments(true);
      try {
        attachments = await Promise.all(
          files.map(async (file) => ({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64Data: await readFileAsBase64(file),
          })),
        );
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : 'Could not read one of the attachments');
        setPreparingAttachments(false);
        return;
      }
      setPreparingAttachments(false);
    }

    const ok = await sendMessage({
      to: to.trim(),
      cc: cc.trim() || undefined,
      subject: subject.trim(),
      bodyHtml,
      threadId: draft.threadId,
      inReplyTo: draft.inReplyTo ?? undefined,
      references: draft.references ?? undefined,
      attachments,
    });
    if (ok) onSent();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 p-0 md:items-center md:p-4">
      <div className="flex h-[85vh] w-full max-w-2xl flex-col rounded-t-xl bg-paper shadow-2xl dark:bg-night-panel md:h-auto md:max-h-[85vh] md:rounded-xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3 dark:border-white/10">
          <h2 className="font-display text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-ink-faint hover:bg-ink/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {sendError && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-brick/30 bg-brick/5 px-3 py-2.5 text-xs text-brick">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {sendError}
            </div>
          )}

          <div className="flex items-center gap-2 border-b border-ink/10 py-2 dark:border-white/10">
            <span className="w-10 shrink-0 text-xs text-ink-faint">To</span>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="shrink-0 text-xs font-medium text-ink-faint hover:text-ink-soft"
              >
                Cc
              </button>
            )}
          </div>

          {showCc && (
            <div className="flex items-center gap-2 border-b border-ink/10 py-2 dark:border-white/10">
              <span className="w-10 shrink-0 text-xs text-ink-faint">Cc</span>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@example.com"
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          )}

          <div className="flex items-center gap-2 border-b border-ink/10 py-2 dark:border-white/10">
            <span className="w-10 shrink-0 text-xs text-ink-faint">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={10}
            className="mt-3 w-full resize-none rounded-md border border-ink/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-brass dark:border-white/10"
          />

          {attachError && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-brick/30 bg-brick/5 px-3 py-2 text-xs text-brick">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {attachError}
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {files.map((file, i) => (
                <span
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-1.5 rounded-md border border-ink/10 bg-ink/5 px-2 py-1 text-xs text-ink-soft dark:border-white/10 dark:bg-white/5 dark:text-paper/70"
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-ink-faint" />
                  <span className="max-w-[10rem] truncate">{file.name}</span>
                  <span className="text-ink-faint">{formatBytes(file.size)}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-ink-faint hover:text-brick"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesPicked(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-ink-soft"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Attach files
          </button>

          {draft.quotedHtml && (
            <div className="mt-3 border-t border-ink/10 pt-2 dark:border-white/10">
              <button
                onClick={() => setShowQuoted((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-ink-faint hover:text-ink-soft"
              >
                {showQuoted ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showQuoted ? 'Hide' : 'Show'} quoted message
              </button>
              {showQuoted && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-ink/10 bg-ink/5 p-3 text-xs text-ink-faint dark:border-white/10 dark:bg-white/5">
                  {draft.quotedFromLine && <p className="mb-1 font-medium">{draft.quotedFromLine}</p>}
                  <div
                    // Same sanitized HTML already used in the reading pane — passed
                    // straight through from there, never re-fetched or re-parsed here.
                    dangerouslySetInnerHTML={{ __html: draft.quotedHtml }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-4 py-3 dark:border-white/10">
          <button
            onClick={onClose}
            className="rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSend()}
            disabled={sending || preparingAttachments || !to.trim() || !subject.trim() || !body.trim()}
            className="flex items-center gap-1.5 rounded-md bg-brass px-4 py-1.5 text-xs font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          >
            <Send className="h-3.5 w-3.5" />
            {preparingAttachments ? 'Preparing…' : sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
