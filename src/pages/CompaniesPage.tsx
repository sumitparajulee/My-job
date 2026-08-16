import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Building2, Globe, Plus, Search, Briefcase, ExternalLink, FileDown, Star, Newspaper } from 'lucide-react';
import type { Company } from '@/types/models';
import { COMPANY_SIZE_LABELS, FUNDING_STAGE_LABELS, STATUS_LABELS } from '@/types/models';
import { useDocketStore } from '@/store/useDocketStore';
import { CompanyFormModal } from '@/components/CompanyForm/CompanyFormModal';
import { exportCompanyReportPdf } from '@/lib/report';
import { useToastStore } from '@/store/useToastStore';

export function CompaniesPage() {
  const companies = useDocketStore((s) => s.companies);
  const jobs = useDocketStore((s) => s.jobs);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Company | null | undefined>(undefined); // undefined = closed
  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleExportCompany = async (company: Company, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingId(company.id);
    try {
      await exportCompanyReportPdf(company);
    } catch {
      useToastStore.getState().push({ message: 'Report generation failed', tone: 'danger' });
    } finally {
      setExportingId(null);
    }
  };

  const jobsFor = (companyId: string) => jobs.filter((j) => j.companyId === companyId && !j.deletedAt);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? companies.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.industry?.toLowerCase().includes(q) ||
            c.website?.toLowerCase().includes(q),
        )
      : companies;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, search]);

  return (
    <div className="h-full overflow-auto px-6 pb-8 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Companies</h1>
          <p className="text-sm text-ink-faint">Every company you've applied to, at a glance</p>
        </div>
        <button
          onClick={() => setEditing(null)}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-brass px-3.5 py-2 text-sm font-semibold text-white shadow-stamp transition-transform hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          Add company
        </button>
      </div>

      <div className="relative mt-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          className="input pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <Building2 className="h-8 w-8 text-ink-faint" strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold">
            {companies.length === 0 ? 'No companies yet' : 'No matches'}
          </p>
          <p className="max-w-xs text-sm text-ink-faint">
            {companies.length === 0
              ? 'Companies are created automatically when you add a job, or you can add one directly here.'
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((company) => {
            const companyJobs = jobsFor(company.id);
            const active = companyJobs.filter(
              (j) => j.status !== 'archived' && j.status !== 'rejected',
            ).length;
            return (
              // A plain <button> can't contain the per-job <a> links below
              // (nested interactive elements are invalid HTML and break
              // click handling) — a div with the same role/keyboard
              // behavior keeps the "click card to edit company" affordance
              // while letting each job chip carry its own link.
              <div
                key={company.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditing(company)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setEditing(company);
                  }
                }}
                className="group flex cursor-pointer flex-col gap-2 rounded-lg border border-ink/10 bg-white p-4 text-left shadow-card transition-colors hover:border-brass/40 dark:border-white/10 dark:bg-night-panel"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink/10">
                      <Building2 className="h-4.5 w-4.5 text-ink" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-semibold">{company.name}</p>
                      {company.industry && (
                        <p className="truncate text-xs text-ink-faint">{company.industry}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleExportCompany(company, e)}
                    disabled={exportingId === company.id}
                    title="Download company report (PDF)"
                    className="shrink-0 rounded-md p-1.5 text-ink-faint opacity-0 transition-opacity hover:bg-ink/5 hover:text-brass group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-white/5"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {company.website && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                    <Globe className="h-3 w-3 shrink-0" />
                    <span className="truncate">{company.website.replace(/^https?:\/\//, '')}</span>
                  </div>
                )}

                {(company.fundingStage || company.companySize || company.glassdoorRating != null) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {company.fundingStage && (
                      <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-medium text-forest">
                        {FUNDING_STAGE_LABELS[company.fundingStage]}
                      </span>
                    )}
                    {company.companySize && (
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink-soft dark:bg-white/10 dark:text-paper/70">
                        {COMPANY_SIZE_LABELS[company.companySize]}
                      </span>
                    )}
                    {company.glassdoorRating != null && (
                      <span className="flex items-center gap-0.5 rounded-full bg-brass/10 px-2 py-0.5 text-[10px] font-medium text-brass-dim">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        {company.glassdoorRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                )}

                {company.recentNews && (
                  <div className="flex items-start gap-1.5 text-xs text-ink-faint">
                    <Newspaper className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-2">{company.recentNews}</span>
                  </div>
                )}

                <div className="mt-1 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-ink-faint" />
                  <span className="text-xs text-ink-faint">
                    {companyJobs.length === 0
                      ? 'No applications'
                      : `${companyJobs.length} application${companyJobs.length === 1 ? '' : 's'}`}
                    {active > 0 && ` · ${active} active`}
                  </span>
                </div>

                {companyJobs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {companyJobs.slice(0, 3).map((j) => (
                      <span
                        key={j.id}
                        className="flex max-w-full items-center gap-1 truncate rounded-full border border-ink/10 py-0.5 pl-2 pr-1 text-[10px] text-ink-soft dark:border-white/10 dark:text-paper/70"
                      >
                        <span className="truncate">
                          {j.position} · {STATUS_LABELS[j.status]}
                        </span>
                        {j.jobUrl && (
                          <a
                            href={j.jobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            // Stop this from bubbling to the card's onClick
                            // (which opens the company edit modal) — this
                            // link should open the job posting instead.
                            onClick={(e) => e.stopPropagation()}
                            title="Open job posting"
                            className="shrink-0 rounded p-0.5 text-ink-faint hover:bg-ink/10 hover:text-brass dark:hover:bg-white/10"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </span>
                    ))}
                    {companyJobs.length > 3 && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] text-ink-faint">
                        +{companyJobs.length - 3} more
                      </span>
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
          <CompanyFormModal company={editing} onClose={() => setEditing(undefined)} />
        )}
      </AnimatePresence>
    </div>
  );
}
