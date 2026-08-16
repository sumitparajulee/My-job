import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ClipboardPaste, ArrowRight } from 'lucide-react';
import { parseJobPosting } from '@/lib/jobParse';
import { useUIStore } from '@/store/useUIStore';

export function JobCaptureModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const setCaptureDraft = useUIStore((s) => s.setCaptureDraft);
  const openJobModal = useUIStore((s) => s.openJobModal);

  const draft = parseJobPosting(text);
  const hasSomething = Boolean(draft.position || draft.companyName || draft.location || draft.jobUrl);

  function handleContinue() {
    setCaptureDraft(draft);
    onClose();
    openJobModal('new');
  }

  async function handlePasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setText(clip);
    } catch {
      // Clipboard access can be blocked (permissions, insecure context) —
      // the person can still paste into the textarea manually with
      // Cmd/Ctrl+V, so this just no-ops rather than showing an error.
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-night-panel"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-ink/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-night-panel">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ClipboardPaste className="h-4 w-4 text-brass" />
            Paste to capture
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-faint hover:bg-ink/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-xs text-ink-faint">
            Paste a job listing — from LinkedIn, Seek, an email, anywhere — and we'll try to pull out the
            position, company, location, and link. You'll get a chance to fix anything before it's saved.
          </p>

          <div className="relative">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Paste the job posting text here…"
              className="input resize-none font-mono text-xs"
            />
            {!text && (
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-md border border-ink/10 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-soft shadow-sm hover:bg-ink/5 dark:border-white/10 dark:bg-night-panel dark:text-paper/70 dark:hover:bg-white/5"
              >
                <ClipboardPaste className="h-3 w-3" />
                Paste from clipboard
              </button>
            )}
          </div>

          {text && (
            <div className="rounded-md border border-ink/10 bg-ink/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
              <p className="mb-2 text-xs font-medium text-ink-soft dark:text-paper/60">
                {hasSomething ? "Here's what we picked up:" : "Couldn't pick anything up from that — no problem, the form opens blank."}
              </p>
              <dl className="space-y-1 text-xs">
                {draft.position && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-faint">Position</dt>
                    <dd className="text-ink dark:text-paper">{draft.position}</dd>
                  </div>
                )}
                {draft.companyName && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-faint">Company</dt>
                    <dd className="text-ink dark:text-paper">{draft.companyName}</dd>
                  </div>
                )}
                {draft.location && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-faint">Location</dt>
                    <dd className="text-ink dark:text-paper">{draft.location}</dd>
                  </div>
                )}
                {draft.jobUrl && (
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-faint">Link</dt>
                    <dd className="truncate text-ink dark:text-paper">{draft.jobUrl}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="flex items-center gap-1.5 rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
