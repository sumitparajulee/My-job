import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FileText, Plus, Copy, Check, MessageSquareText } from 'lucide-react';
import type { MessageTemplate } from '@/types/models';
import { TEMPLATE_KIND_LABELS } from '@/types/models';
import { useTemplateStore } from '@/store/useTemplateStore';
import { useDocketStore } from '@/store/useDocketStore';
import { TemplateFormModal } from '@/components/TemplateForm/TemplateFormModal';
import { fillTemplate } from '@/lib/templateFill';
import { useToastStore } from '@/store/useToastStore';

export function TemplatesPage() {
  const templates = useTemplateStore((s) => s.templates);
  const initTemplates = useTemplateStore((s) => s.init);
  const jobs = useDocketStore((s) => s.jobs);
  const companies = useDocketStore((s) => s.companies);
  const recruiters = useDocketStore((s) => s.recruiters);

  const [editing, setEditing] = useState<MessageTemplate | null | undefined>(undefined); // undefined = closed
  const [fillingId, setFillingId] = useState<string | null>(null);
  const [jobId, setJobId] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    void initTemplates();
  }, [initTemplates]);

  const liveJobs = useMemo(
    () => [...jobs].filter((j) => !j.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [jobs],
  );

  const selectedJob = jobs.find((j) => j.id === jobId);
  const selectedCompany = companies.find((c) => c.id === selectedJob?.companyId);
  const selectedRecruiter = recruiters.find((r) => r.id === selectedJob?.recruiterId);

  const fillingTemplate = templates.find((t) => t.id === fillingId);
  const preview = fillingTemplate
    ? fillTemplate(fillingTemplate, { job: selectedJob, company: selectedCompany, recruiter: selectedRecruiter })
    : null;

  async function handleCopy() {
    if (!preview || !fillingId) return;
    const text = preview.subject ? `${preview.subject}\n\n${preview.body}` : preview.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(fillingId);
      useToastStore.getState().push({ message: 'Copied to clipboard', tone: 'success', duration: 2000 });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      useToastStore.getState().push({ message: 'Copy failed — select and copy manually', tone: 'danger' });
    }
  }

  return (
    <div className="h-full overflow-auto px-6 pb-8 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Templates</h1>
          <p className="text-sm text-ink-faint">Reusable follow-ups, thank-yous, and outreach copy</p>
        </div>
        <button
          onClick={() => setEditing(null)}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-brass px-3.5 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          New template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <FileText className="h-8 w-8 text-ink-faint" strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold">No templates yet</p>
          <p className="max-w-xs text-sm text-ink-faint">
            Write a follow-up or thank-you note once, then fill it in for any application in a couple of
            clicks.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const isFilling = fillingId === template.id;
            return (
              <div
                key={template.id}
                className="flex flex-col gap-2 rounded-lg border border-ink/10 bg-white p-4 shadow-card dark:border-white/10 dark:bg-night-panel"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(template)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditing(template);
                    }
                  }}
                  className="flex cursor-pointer items-start justify-between gap-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold">{template.name}</p>
                    <p className="text-xs text-ink-faint">{TEMPLATE_KIND_LABELS[template.kind]}</p>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink/10">
                    <MessageSquareText className="h-4 w-4 text-ink" />
                  </div>
                </div>

                <p className="line-clamp-2 text-xs text-ink-faint">{template.body}</p>

                <button
                  onClick={() => {
                    setFillingId(isFilling ? null : template.id);
                    setCopiedId(null);
                  }}
                  className="mt-1 rounded-md border border-ink/10 px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                >
                  {isFilling ? 'Hide' : 'Fill in for a job…'}
                </button>

                {isFilling && (
                  <div className="mt-1 space-y-2 rounded-md border border-ink/10 bg-ink/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
                    <select
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                      className="input text-xs"
                    >
                      <option value="">Choose an application…</option>
                      {liveJobs.map((j) => {
                        const c = companies.find((co) => co.id === j.companyId);
                        return (
                          <option key={j.id} value={j.id}>
                            {j.position} {c ? `at ${c.name}` : ''}
                          </option>
                        );
                      })}
                    </select>

                    {preview && jobId && (
                      <>
                        <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-ink/10 bg-white p-2 font-mono text-[11px] text-ink dark:border-white/10 dark:bg-night-panel dark:text-paper">
                          {preview.subject && (
                            <div className="mb-1 font-semibold">{preview.subject}</div>
                          )}
                          {preview.body}
                        </div>
                        <button
                          onClick={handleCopy}
                          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brass px-3 py-1.5 text-xs font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
                        >
                          {copiedId === template.id ? (
                            <>
                              <Check className="h-3 w-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              Copy to clipboard
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {editing !== undefined && (
          <TemplateFormModal template={editing} onClose={() => setEditing(undefined)} />
        )}
      </AnimatePresence>
    </div>
  );
}
