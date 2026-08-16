import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Trash2, Upload, Download, FolderOpen, Mail, Briefcase, File as FileIcon } from 'lucide-react';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocketDocument,
  type DocumentType,
} from '@/types/models';
import { useDocumentStore } from '@/store/useDocumentStore';
import { useDocketStore } from '@/store/useDocketStore';
import { useToastStore } from '@/store/useToastStore';
import { cn, formatDate, computeResumeStats } from '@/lib/utils';

const TYPE_ICON: Record<DocumentType, typeof FileText> = {
  resume: FileText,
  cover_letter: Mail,
  cv: FileText,
  portfolio: Briefcase,
  other: FileIcon,
};

const TYPE_BADGE: Record<DocumentType, string> = {
  resume: 'bg-forest/15 text-forest dark:bg-forest/20',
  cover_letter: 'bg-brass/15 text-brass-dim dark:bg-brass/20 dark:text-brass-soft',
  cv: 'bg-slate/15 text-slate dark:bg-slate/25',
  portfolio: 'bg-brick/15 text-brick dark:bg-brick/20 dark:text-brick-soft',
  other: 'bg-ink/10 text-ink-soft dark:bg-white/10 dark:text-paper/60',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadDocument(doc: DocketDocument) {
  const link = document.createElement('a');
  link.href = `data:${doc.mimeType};base64,${doc.data}`;
  link.download = doc.name;
  link.click();
}

// Shown after picking a file, so the upload always gets tagged with a type
// up front rather than defaulting silently to "Other".
function TypePickerModal({
  fileName,
  onPick,
  onCancel,
}: {
  fileName: string;
  onPick: (type: DocumentType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-lg border border-ink/10 bg-white p-5 shadow-lg dark:border-white/10 dark:bg-night-panel"
      >
        <h3 className="font-display text-lg font-semibold">What kind of document?</h3>
        <p className="mt-1 truncate text-xs text-ink-faint">{fileName}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {DOCUMENT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => onPick(type)}
              className="rounded-md border border-ink/10 px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-brass hover:text-brass dark:border-white/10 dark:text-paper/70"
            >
              {DOCUMENT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-4 w-full text-center text-xs text-ink-faint hover:text-ink-soft dark:hover:text-paper/70"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}

export function DocumentsPage() {
  const documents = useDocumentStore((s) => s.documents);
  const isReady = useDocumentStore((s) => s.isReady);
  const init = useDocumentStore((s) => s.init);
  const addDocument = useDocumentStore((s) => s.addDocument);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const jobs = useDocketStore((s) => s.jobs);
  const updateJobDocLink = useDocketStore((s) => s.updateJob);
  const pushToast = useToastStore((s) => s.push);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [activeFilter, setActiveFilter] = useState<DocumentType | 'all'>('all');

  useEffect(() => {
    void init();
  }, [init]);

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    setPendingFile(file);
  }

  async function confirmUpload(type: DocumentType) {
    if (!pendingFile) return;
    try {
      await addDocument(pendingFile, type);
      pushToast({ message: `Uploaded "${pendingFile.name}"`, tone: 'success' });
    } catch {
      pushToast({ message: 'Upload failed — try again', tone: 'danger' });
    }
    setPendingFile(null);
  }

  async function handleDelete(doc: DocketDocument) {
    // Deleting the document out from under a job that still points at it
    // would leave a dangling id - the job form would silently show
    // "None linked" (the select just wouldn't find a match), but the
    // stale id would linger in storage. Clear it explicitly instead.
    const linkedJobs = jobs.filter(
      (j) => !j.deletedAt && (j.resumeVersionId === doc.id || j.coverLetterVersionId === doc.id),
    );
    await Promise.all(
      linkedJobs.map((j) =>
        updateJobDocLink(j.id, {
          resumeVersionId: j.resumeVersionId === doc.id ? undefined : j.resumeVersionId,
          coverLetterVersionId: j.coverLetterVersionId === doc.id ? undefined : j.coverLetterVersionId,
        }),
      ),
    );
    await deleteDocument(doc.id);
    pushToast({ message: `Removed "${doc.name}"`, tone: 'danger' });
  }

  const filtered =
    activeFilter === 'all' ? documents : documents.filter((d) => d.type === activeFilter);

  const counts = DOCUMENT_TYPES.reduce<Record<string, number>>((acc, type) => {
    acc[type] = documents.filter((d) => d.type === type).length;
    return acc;
  }, {});

  // How many active applications currently point at this exact document
  // - set from the "Documents sent" picker on the job form.
  function usageCount(docId: string): number {
    return jobs.filter(
      (j) => !j.deletedAt && (j.resumeVersionId === docId || j.coverLetterVersionId === docId),
    ).length;
  }

  // Interview/offer rate per resume version - only meaningful for resume-type
  // documents, since resumeVersionId is what's tracked per job. See
  // computeResumeStats in lib/utils.ts for the shared definition also used
  // on the Analytics page, so the two numbers never drift apart.
  const resumeStats = useMemo(
    () => computeResumeStats(jobs.filter((j) => !j.deletedAt)),
    [jobs],
  );

  return (
    <div className="flex h-full flex-col px-6 pt-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-ink-faint">
            {documents.length} file{documents.length === 1 ? '' : 's'} stored on this device
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-full bg-brass px-4 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePicked} />
      </div>

      <div className="mt-4 rounded-2xl bg-white p-5 shadow-card dark:bg-night-panel">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <button
            onClick={() => setActiveFilter('all')}
            className="flex flex-col items-center gap-2 text-center"
          >
            <span
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                activeFilter === 'all' ? 'bg-brass/10' : 'bg-paper-dim dark:bg-white/5',
              )}
            >
              <FolderOpen className={cn('h-5 w-5', activeFilter === 'all' ? 'text-brass' : 'text-ink-soft dark:text-paper/70')} />
            </span>
            <span className="text-[11px] font-medium leading-tight text-ink-soft dark:text-paper/70">
              All ({documents.length})
            </span>
          </button>
          {DOCUMENT_TYPES.map((type) => {
            const Icon = TYPE_ICON[type];
            const isActive = activeFilter === type;
            return (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className="flex flex-col items-center gap-2 text-center"
              >
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                    isActive ? 'bg-brass/10' : 'bg-paper-dim dark:bg-white/5',
                  )}
                >
                  <Icon className={cn('h-5 w-5', isActive ? 'text-brass' : 'text-ink-soft dark:text-paper/70')} />
                </span>
                <span className="text-[11px] font-medium leading-tight text-ink-soft dark:text-paper/70">
                  {DOCUMENT_TYPE_LABELS[type]} ({counts[type] ?? 0})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-auto pb-6">
        {!isReady ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-faint">
            Loading documents…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ink/15 text-center dark:border-white/15">
            <FileText className="h-6 w-6 text-ink-faint" strokeWidth={1.5} />
            <p className="text-sm text-ink-faint">
              {activeFilter === 'all'
                ? 'No documents yet'
                : `No ${DOCUMENT_TYPE_LABELS[activeFilter as DocumentType].toLowerCase()} uploaded yet`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                className="rounded-md border border-ink/10 bg-white px-3.5 py-3 shadow-card dark:border-white/10 dark:bg-night-panel"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                    <span className="truncate text-sm font-medium text-ink dark:text-paper">
                      {doc.name}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      TYPE_BADGE[doc.type],
                    )}
                  >
                    {DOCUMENT_TYPE_LABELS[doc.type]}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-ink-faint">
                  <span>
                    {formatDate(doc.createdAt)} · {formatSize(doc.size)}
                    {usageCount(doc.id) > 0 && (
                      <span className="ml-1.5 rounded-full bg-forest/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-forest dark:bg-forest/20">
                        Used in {usageCount(doc.id)}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadDocument(doc)}
                      className="text-ink-faint transition-colors hover:text-brass"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc)}
                      className="text-ink-faint transition-colors hover:text-brick"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Resume version performance - only shows once this exact
                    resume has been linked to at least one application, so
                    a freshly-uploaded version doesn't show a misleading 0%. */}
                {doc.type === 'resume' && resumeStats.get(doc.id) && (
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5 border-t border-dashed border-ink/10 pt-2.5 dark:border-white/10">
                    <div className="text-center">
                      <div className="font-display text-sm font-semibold text-ink dark:text-paper">
                        {resumeStats.get(doc.id)!.applications}
                      </div>
                      <div className="text-[9px] uppercase tracking-wide text-ink-faint">Sent</div>
                    </div>
                    <div className="text-center">
                      <div className="font-display text-sm font-semibold text-forest">
                        {resumeStats.get(doc.id)!.interviewRate}%
                      </div>
                      <div className="text-[9px] uppercase tracking-wide text-ink-faint">Interview</div>
                    </div>
                    <div className="text-center">
                      <div className="font-display text-sm font-semibold text-brass">
                        {resumeStats.get(doc.id)!.offerRate}%
                      </div>
                      <div className="text-[9px] uppercase tracking-wide text-ink-faint">Offer</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingFile && (
        <TypePickerModal
          fileName={pendingFile.name}
          onPick={confirmUpload}
          onCancel={() => setPendingFile(null)}
        />
      )}
    </div>
  );
}
