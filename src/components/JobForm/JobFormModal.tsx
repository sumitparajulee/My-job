import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { nanoid } from 'nanoid';
import {
  X,
  Trash2,
  ExternalLink,
  AlertTriangle,
  Plus,
  History,
  FileText,
  Download,
  ListChecks,
  CheckSquare,
  Square,
  Star,
  NotebookPen,
} from 'lucide-react';
import {
  APPLICATION_SOURCES,
  KANBAN_STATUSES,
  SOURCE_LABELS,
  STATUS_LABELS,
  DEFAULT_PREP_ITEMS,
  type Job,
  type DocketDocument,
  type PrepChecklistItem,
  type JobDebrief,
} from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { useDocumentStore } from '@/store/useDocumentStore';
import { useToastStore } from '@/store/useToastStore';
import { useUIStore, type JobDraft } from '@/store/useUIStore';
import { SoftwareInput } from './SoftwareInput';
import { cn, formatDate } from '@/lib/utils';

// Duplicated from DocumentsPage's downloadDocument rather than shared -
// small enough (three lines) that a shared util would cost more
// indirection than it saves.
function downloadDocumentFile(doc: DocketDocument) {
  const link = document.createElement('a');
  link.href = `data:${doc.mimeType};base64,${doc.data}`;
  link.download = doc.name;
  link.click();
}

const schema = z.object({
  companyName: z.string().min(1, 'Company is required'),
  position: z.string().min(1, 'Position is required'),
  status: z.enum(KANBAN_STATUSES),
  location: z.string().optional(),
  salary: z.string().optional(),
  jobUrl: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
  applicationDate: z.string().optional(),
  deadline: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  source: z.enum(APPLICATION_SOURCES).optional(),
  notes: z.string().optional(),
  tagsInput: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// For a new job, a capture draft (from the quick-capture bookmarklet)
// takes priority over blank defaults but never overrides an existing job
// — job is only non-null when editing, and edits should never be
// clobbered by a leftover draft.
function jobToFormValues(job: Job | null, companyName: string, draft: JobDraft | null): FormValues {
  return {
    companyName: job ? companyName : draft?.companyName ?? companyName,
    position: job?.position ?? draft?.position ?? '',
    status: job?.status ?? 'wishlist',
    location: job?.location ?? draft?.location ?? '',
    salary: job?.salary ?? '',
    jobUrl: job?.jobUrl ?? draft?.jobUrl ?? '',
    applicationDate: job?.applicationDate?.slice(0, 10) ?? '',
    deadline: job?.deadline?.slice(0, 10) ?? '',
    priority: job?.priority,
    source: job?.source,
    notes: job?.notes ?? '',
    tagsInput: job?.tags.join(', ') ?? '',
  };
}

export function JobFormModal({
  job,
  onClose,
}: {
  job: Job | null; // null = creating a new job
  onClose: () => void;
}) {
  const companies = useDocketStore((s) => s.companies);
  const createJob = useDocketStore((s) => s.createJob);
  const updateJob = useDocketStore((s) => s.updateJob);
  const upsertCompany = useDocketStore((s) => s.upsertCompany);
  const deleteJobWithUndo = useDocketStore((s) => s.deleteJobWithUndo);
  const findPossibleDuplicates = useDocketStore((s) => s.findPossibleDuplicates);
  const timelineForJob = useDocketStore((s) => s.timelineForJob(job?.id ?? ''));
  const addTimelineEvent = useDocketStore((s) => s.addTimelineEvent);
  const deleteTimelineEvent = useDocketStore((s) => s.deleteTimelineEvent);

  const documents = useDocumentStore((s) => s.documents);
  const documentsReady = useDocumentStore((s) => s.isReady);
  const initDocuments = useDocumentStore((s) => s.init);

  const currentCompanyName = job ? companies.find((c) => c.id === job.companyId)?.name ?? '' : '';
  const [noteDraft, setNoteDraft] = useState('');
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(false);
  const [prepChecklist, setPrepChecklist] = useState<PrepChecklistItem[]>(job?.prepChecklist ?? []);
  const [newPrepItem, setNewPrepItem] = useState('');
  const [debrief, setDebrief] = useState<JobDebrief>(job?.debrief ?? {});
  // Kept outside react-hook-form (like the documents pickers above) -
  // this is chip/array state, not a single form field the zod schema
  // needs to validate.
  const [software, setSoftware] = useState<string[]>(job?.software ?? []);
  const jobs = useDocketStore((s) => s.jobs);
  const allKnownSoftware = [...new Set(jobs.flatMap((j) => j.software ?? []))];

  // JobFormModal can open before the person has ever visited the
  // Documents page (which is what normally triggers this store's
  // init()), so the resume/cover-letter pickers below need their own
  // call here. init() no-ops if it's already loaded.
  useEffect(() => {
    void initDocuments();
  }, [initDocuments]);

  // Captured once at mount time — the draft is meant to seed this one
  // form open, not linger for anything opened after it. Consuming
  // useUIStore.getState() directly (rather than the reactive hook) and
  // clearing it in the same effect keeps that a one-shot read.
  const captureDraft = job ? null : useUIStore.getState().captureDraft;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: jobToFormValues(job, currentCompanyName, captureDraft),
  });

  useEffect(() => {
    if (captureDraft) useUIStore.getState().setCaptureDraft(null);
    // Only needs to run once, right after this modal mounts with a draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watched (not just the initial defaultValue) so the "Open" link reflects
  // whatever the person has just typed/pasted, before they've saved.
  const jobUrlValue = watch('jobUrl');
  const companyNameValue = watch('companyName');
  const positionValue = watch('position');

  // Only relevant when creating a new job — editing an existing one
  // shouldn't warn about matching itself.
  const duplicates = job ? [] : findPossibleDuplicates(companyNameValue ?? '', positionValue ?? '');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const onSubmit = async (values: FormValues) => {
    const tags = (values.tagsInput ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (job) {
      const company = await upsertCompany(values.companyName);
      await updateJob(job.id, {
        companyId: company.id,
        position: values.position,
        status: values.status,
        location: values.location || undefined,
        salary: values.salary || undefined,
        jobUrl: values.jobUrl || undefined,
        applicationDate: values.applicationDate || undefined,
        deadline: values.deadline || undefined,
        priority: values.priority,
        source: values.source,
        notes: values.notes || undefined,
        tags,
        software,
      });
    } else {
      await createJob({
        companyName: values.companyName,
        position: values.position,
        status: values.status,
        location: values.location || undefined,
        salary: values.salary || undefined,
        jobUrl: values.jobUrl || undefined,
        applicationDate: values.applicationDate || undefined,
        deadline: values.deadline || undefined,
        priority: values.priority,
        source: values.source,
        notes: values.notes || undefined,
        tags,
        software,
      });
    }
    useToastStore.getState().push({
      message: job ? `Saved "${values.position}"` : `Added "${values.position}"`,
      tone: 'success',
      duration: 2500,
    });
    onClose();
  };

  const handleDelete = async () => {
    if (!job) return;
    await deleteJobWithUndo(job.id);
    onClose();
  };

  // Saved immediately on change (like timeline notes) rather than
  // waiting for the form's own Save button - picking a document is a
  // one-off action, not part of the multi-field edit the rest of the
  // form batches together.
  async function setLinkedDocument(field: 'resumeVersionId' | 'coverLetterVersionId', docId: string) {
    if (!job) return;
    await updateJob(job.id, { [field]: docId || undefined });
  }

  // Prep checklist and debrief both save immediately (like the linked
  // document pickers above) rather than waiting for the form's Save
  // button - a checked box or a jotted note shouldn't be lost if the
  // person closes the modal without touching anything else.
  async function persistPrepChecklist(next: PrepChecklistItem[]) {
    setPrepChecklist(next);
    if (job) await updateJob(job.id, { prepChecklist: next });
  }

  function addPrepItem(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    void persistPrepChecklist([...prepChecklist, { id: nanoid(), text: trimmed, done: false }]);
    setNewPrepItem('');
  }

  function togglePrepItem(id: string) {
    void persistPrepChecklist(prepChecklist.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function removePrepItem(id: string) {
    void persistPrepChecklist(prepChecklist.filter((i) => i.id !== id));
  }

  function seedDefaultChecklist() {
    const existing = new Set(prepChecklist.map((i) => i.text));
    const additions = DEFAULT_PREP_ITEMS.filter((t) => !existing.has(t)).map((text) => ({
      id: nanoid(),
      text,
      done: false,
    }));
    if (additions.length) void persistPrepChecklist([...prepChecklist, ...additions]);
  }

  async function persistDebrief(next: JobDebrief) {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setDebrief(stamped);
    if (job) await updateJob(job.id, { debrief: stamped });
  }

  const doneCount = prepChecklist.filter((i) => i.done).length;
  // Debrief only makes sense once an interview has actually happened -
  // showing it earlier would just be an empty section nobody can fill in.
  const showDebrief =
    job && ['interview', 'reference_check', 'offer', 'accepted', 'rejected'].includes(job.status);

  const resumeOptions = documents.filter((d) => d.type === 'resume' || d.type === 'cv');
  const coverLetterOptions = documents.filter((d) => d.type === 'cover_letter');
  const linkedResume = documents.find((d) => d.id === job?.resumeVersionId);
  const linkedCoverLetter = documents.find((d) => d.id === job?.coverLetterVersionId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="h-full w-full overflow-y-auto bg-white shadow-xl dark:bg-night-panel sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg sm:rounded-lg"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-night-panel">
          <h2 className="font-display text-lg font-semibold">
            {job ? 'Edit application' : 'New application'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-faint hover:bg-ink/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company" error={errors.companyName?.message}>
              <input
                {...register('companyName')}
                list="company-list"
                className="input"
                placeholder="Acme Inc."
              />
              <datalist id="company-list">
                {companies.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Position">
              <input {...register('position')} className="input" placeholder="Product Designer" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select {...register('status')} className="input">
                {KANBAN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select {...register('priority')} className="input">
                <option value="">—</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Location">
              <input {...register('location')} className="input" placeholder="Remote / Sydney" />
            </Field>
            <Field label="Salary">
              <input {...register('salary')} className="input" placeholder="$120k–$140k" />
            </Field>
          </div>

          <Field label="Source">
            <select {...register('source')} className="input">
              <option value="">—</option>
              {APPLICATION_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Job URL"
            error={errors.jobUrl?.message}
            action={
              jobUrlValue ? (
                <a
                  href={jobUrlValue}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-brass hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
              ) : undefined
            }
          >
            <input {...register('jobUrl')} className="input" placeholder="https://…" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Applied on">
              <input type="date" {...register('applicationDate')} className="input" />
            </Field>
            <Field label="Deadline">
              <input type="date" {...register('deadline')} className="input" />
            </Field>
          </div>

          <Field label="Tags (comma-separated)">
            <input {...register('tagsInput')} className="input" placeholder="dream-job, contract" />
          </Field>

          <Field label="Software required">
            <SoftwareInput value={software} onChange={setSoftware} allKnownSoftware={allKnownSoftware} />
          </Field>

          <Field label="Notes">
            <textarea {...register('notes')} rows={3} className="input resize-none" />
          </Field>

          {duplicates.length > 0 && !ignoreDuplicates && (
            <div className="flex items-start gap-2 rounded-md border border-brass/30 bg-brass/10 px-3 py-2.5 text-xs text-ink-soft dark:text-paper/70">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brass" />
              <div className="flex-1">
                You already have {duplicates.length === 1 ? 'an entry' : `${duplicates.length} entries`}{' '}
                for "{positionValue}" at {companyNameValue} ({STATUS_LABELS[duplicates[0].status]}).
                Adding another will create a separate card.
              </div>
              <button
                type="button"
                onClick={() => setIgnoreDuplicates(true)}
                className="shrink-0 font-medium text-brass hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {job && documentsReady && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft dark:text-paper/60">
                <FileText className="h-3.5 w-3.5" />
                Documents sent
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Resume"
                  action={
                    linkedResume ? (
                      <button
                        type="button"
                        onClick={() => downloadDocumentFile(linkedResume)}
                        className="flex items-center gap-1 text-xs font-medium text-brass hover:underline"
                      >
                        <Download className="h-3 w-3" />
                        {formatDate(linkedResume.createdAt)}
                      </button>
                    ) : undefined
                  }
                >
                  <select
                    value={job.resumeVersionId ?? ''}
                    onChange={(e) => void setLinkedDocument('resumeVersionId', e.target.value)}
                    className="input"
                  >
                    <option value="">None linked</option>
                    {resumeOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Cover letter"
                  action={
                    linkedCoverLetter ? (
                      <button
                        type="button"
                        onClick={() => downloadDocumentFile(linkedCoverLetter)}
                        className="flex items-center gap-1 text-xs font-medium text-brass hover:underline"
                      >
                        <Download className="h-3 w-3" />
                        {formatDate(linkedCoverLetter.createdAt)}
                      </button>
                    ) : undefined
                  }
                >
                  <select
                    value={job.coverLetterVersionId ?? ''}
                    onChange={(e) => void setLinkedDocument('coverLetterVersionId', e.target.value)}
                    className="input"
                  >
                    <option value="">None linked</option>
                    {coverLetterOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {resumeOptions.length === 0 && coverLetterOptions.length === 0 && (
                <p className="mt-1.5 text-xs text-ink-faint">
                  No resumes or cover letters uploaded yet - add some from the Documents page.
                </p>
              )}
            </div>
          )}

          {job && (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft dark:text-paper/60">
                  <ListChecks className="h-3.5 w-3.5" />
                  Interview prep
                  {prepChecklist.length > 0 && (
                    <span className="font-mono text-[10px] text-ink-faint">
                      {doneCount}/{prepChecklist.length}
                    </span>
                  )}
                </div>
                {prepChecklist.length === 0 && (
                  <button
                    type="button"
                    onClick={seedDefaultChecklist}
                    className="text-xs font-medium text-brass hover:underline"
                  >
                    Add starter checklist
                  </button>
                )}
              </div>
              <div className="space-y-1 rounded-md border border-ink/10 bg-ink/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.02]">
                {prepChecklist.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-ink-faint">
                    No prep items yet - add your own below or use the starter checklist.
                  </p>
                ) : (
                  prepChecklist.map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-start gap-2 rounded px-1.5 py-1 text-xs hover:bg-ink/5 dark:hover:bg-white/5"
                    >
                      <button
                        type="button"
                        onClick={() => togglePrepItem(item.id)}
                        className="mt-0.5 shrink-0 text-ink-faint hover:text-forest"
                        aria-label={item.done ? 'Mark not done' : 'Mark done'}
                      >
                        {item.done ? (
                          <CheckSquare className="h-3.5 w-3.5 text-forest" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <span className={cn('min-w-0 flex-1', item.done && 'text-ink-faint line-through')}>
                        {item.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePrepItem(item.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-ink-faint hover:text-brick"
                        aria-label="Remove item"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={newPrepItem}
                  onChange={(e) => setNewPrepItem(e.target.value)}
                  placeholder="Add a prep item…"
                  className="input flex-1 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addPrepItem(newPrepItem);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => addPrepItem(newPrepItem)}
                  className="flex items-center gap-1 rounded-md border border-ink/10 px-2.5 text-xs font-medium text-ink-soft hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
            </div>
          )}

          {showDebrief && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft dark:text-paper/60">
                <NotebookPen className="h-3.5 w-3.5" />
                Debrief
              </div>
              <div className="space-y-2 rounded-md border border-ink/10 bg-ink/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => void persistDebrief({ ...debrief, selfRating: n })}
                      aria-label={`Rate ${n} out of 5`}
                      className="text-ink-faint hover:text-brass"
                    >
                      <Star
                        className={cn(
                          'h-4 w-4',
                          (debrief.selfRating ?? 0) >= n && 'fill-brass text-brass',
                        )}
                      />
                    </button>
                  ))}
                  {debrief.selfRating && (
                    <span className="ml-1 text-xs text-ink-faint">how it felt overall</span>
                  )}
                </div>
                <Field label="What went well">
                  <textarea
                    defaultValue={debrief.wentWell ?? ''}
                    rows={2}
                    className="input resize-none text-xs"
                    onBlur={(e) => void persistDebrief({ ...debrief, wentWell: e.target.value || undefined })}
                  />
                </Field>
                <Field label="What to improve next time">
                  <textarea
                    defaultValue={debrief.toImprove ?? ''}
                    rows={2}
                    className="input resize-none text-xs"
                    onBlur={(e) => void persistDebrief({ ...debrief, toImprove: e.target.value || undefined })}
                  />
                </Field>
              </div>
            </div>
          )}

          {job && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft dark:text-paper/60">
                <History className="h-3.5 w-3.5" />
                Timeline
              </div>
              <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-md border border-ink/10 bg-ink/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.02]">
                {timelineForJob.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-ink-faint">No activity logged yet.</p>
                ) : (
                  timelineForJob
                    .slice()
                    .reverse()
                    .map((event) => (
                      <div
                        key={event.id}
                        className="group flex items-start justify-between gap-2 rounded px-1.5 py-1 text-xs hover:bg-ink/5 dark:hover:bg-white/5"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-ink dark:text-paper">{event.label}</span>
                          {event.note && (
                            <span className="text-ink-faint"> — {event.note}</span>
                          )}
                          <span className="ml-1.5 text-ink-faint">{formatDate(event.date)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteTimelineEvent(event.id)}
                          className="shrink-0 opacity-0 group-hover:opacity-100 text-ink-faint hover:text-brick"
                          aria-label="Remove event"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                )}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a note (e.g. Called recruiter)…"
                  className="input flex-1 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (noteDraft.trim()) {
                        void addTimelineEvent(job.id, 'Note', noteDraft.trim());
                        setNoteDraft('');
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (noteDraft.trim()) {
                      void addTimelineEvent(job.id, 'Note', noteDraft.trim());
                      setNoteDraft('');
                    }
                  }}
                  className="flex items-center gap-1 rounded-md border border-ink/10 px-2.5 text-xs font-medium text-ink-soft hover:bg-ink/5 dark:border-white/10 dark:text-paper/70 dark:hover:bg-white/5"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {job ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-brick hover:bg-brick/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm font-medium text-ink-soft hover:bg-ink/5 dark:text-paper/70 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02] disabled:opacity-60"
              >
                {job ? 'Save changes' : 'Add application'}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function Field({
  label,
  error,
  action,
  children,
}: {
  label: string;
  error?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between">
        <span className="block text-xs font-medium text-ink-soft dark:text-paper/60">{label}</span>
        {action}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-brick">{error}</span>}
    </label>
  );
}
