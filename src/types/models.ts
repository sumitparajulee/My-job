// ============================================================================
// Docket v2 — Core Data Model
// Everything in the app references these normalized entities by id.
// No entity duplicates data owned by another (e.g. a Job never stores a
// company name — it stores companyId and looks the company up).
// ============================================================================

export const KANBAN_STATUSES = [
  'wishlist',
  'ready',
  'applied',
  'assessment',
  'interview',
  'reference_check',
  'offer',
  'accepted',
  'rejected',
  'archived',
] as const;

export type KanbanStatus = (typeof KANBAN_STATUSES)[number];

export const STATUS_LABELS: Record<KanbanStatus, string> = {
  wishlist: 'Wishlist',
  ready: 'Ready to Apply',
  applied: 'Applied',
  assessment: 'Assessment',
  interview: 'Interview',
  reference_check: 'Reference Check',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  archived: 'Archived',
};

export type WorkMode = 'remote' | 'hybrid' | 'onsite';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'casual';
export type Priority = 'low' | 'medium' | 'high';

// Where an application came from. Feeds the Analytics "source" breakdown
// chart and (eventually) lets someone see which channel actually converts.
export const APPLICATION_SOURCES = [
  'linkedin',
  'seek',
  'indeed',
  'company_website',
  'referral',
  'recruiter',
  'networking',
  'other',
] as const;

export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const SOURCE_LABELS: Record<ApplicationSource, string> = {
  linkedin: 'LinkedIn',
  seek: 'Seek',
  indeed: 'Indeed',
  company_website: 'Company website',
  referral: 'Referral',
  recruiter: 'Recruiter',
  networking: 'Networking',
  other: 'Other',
};

// ----------------------------------------------------------------------------
// Sync fields — present on every entity that's shared through a workspace.
// `workspaceId` scopes the row to a collaborative workspace (RLS enforces
// this server-side too). `deletedAt` is a soft-delete tombstone: real-time
// collaborators need to see a delete as an event, not a row disappearing
// out from under them mid-edit, and a hard DELETE can't carry that over
// Realtime as reliably as an UPDATE can. `updatedBy` is whichever member's
// client wrote the row last — used for last-write-wins conflict resolution
// and for the "Alex edited this" hint in the UI.
// ----------------------------------------------------------------------------
export interface SyncMeta {
  workspaceId: string;
  updatedBy?: string;
  deletedAt?: string; // ISO — soft delete
}

// Funding/size are deliberately loose buckets (not raw dollar figures) —
// good enough to skim on a company card, without needing to keep exact
// numbers current as a company raises or grows.
export const FUNDING_STAGES = [
  'bootstrapped',
  'seed',
  'series_a',
  'series_b',
  'series_c_plus',
  'public',
  'private_established',
] as const;

export type FundingStage = (typeof FUNDING_STAGES)[number];

export const FUNDING_STAGE_LABELS: Record<FundingStage, string> = {
  bootstrapped: 'Bootstrapped',
  seed: 'Seed',
  series_a: 'Series A',
  series_b: 'Series B',
  series_c_plus: 'Series C+',
  public: 'Public',
  private_established: 'Private (established)',
};

export const COMPANY_SIZES = ['1_10', '11_50', '51_200', '201_500', '501_1000', '1000_plus'] as const;

export type CompanySize = (typeof COMPANY_SIZES)[number];

export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  '1_10': '1–10 employees',
  '11_50': '11–50 employees',
  '51_200': '51–200 employees',
  '201_500': '201–500 employees',
  '501_1000': '501–1,000 employees',
  '1000_plus': '1,000+ employees',
};

export interface Company extends SyncMeta {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  notes?: string;
  fundingStage?: FundingStage;
  companySize?: CompanySize;
  glassdoorRating?: number; // 1-5, one decimal (e.g. 4.2)
  recentNews?: string; // free-text — a headline or short blurb worth remembering before an interview
  createdAt: string; // ISO
  updatedAt: string;
}

export interface Recruiter extends SyncMeta {
  id: string;
  name: string;
  position?: string;
  companyId?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  notes?: string;
  nextFollowUp?: string; // ISO date
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent extends SyncMeta {
  id: string;
  jobId: string;
  label: string;
  date: string; // ISO
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// Interview prep checklist — a per-job list of things to do before an
// interview (research, STAR stories, questions to ask...). Local, freeform
// items rather than a fixed schema, so it fits any interview format; a
// starter set of common items can be dropped in via DEFAULT_PREP_ITEMS
// (see JobFormModal) instead of typing the same five things every time.
// ----------------------------------------------------------------------------
export interface PrepChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export const DEFAULT_PREP_ITEMS: string[] = [
  'Research the company (recent news, product, mission)',
  'Review the job description line by line',
  'Prepare 2-3 STAR stories relevant to this role',
  'Prepare questions to ask the interviewer',
  'Confirm interview time, location/link, and format',
  'Test camera/mic if remote',
];

// ----------------------------------------------------------------------------
// Post-interview debrief — captured right after an interview while it's
// fresh, so Analytics can eventually show which interviews felt strong vs.
// shaky, not just which ones converted. Deliberately a handful of loose
// fields rather than a structured rubric - this is a personal note-to-self,
// not a scorecard shared with anyone else.
// ----------------------------------------------------------------------------
export interface JobDebrief {
  wentWell?: string;
  toImprove?: string;
  selfRating?: number; // 1-5, "how do I think that went"
  updatedAt?: string; // ISO
}

export interface Job extends SyncMeta {
  id: string;
  companyId: string;
  recruiterId?: string;

  position: string;
  status: KanbanStatus;
  order: number; // position within its status column, for stable drag-and-drop ordering

  salary?: string;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  location?: string;

  jobUrl?: string;
  applicationDate?: string;
  closingDate?: string;
  interviewDate?: string;
  offerDate?: string;
  deadline?: string;

  priority?: Priority;
  rating?: number; // 1-5
  source?: ApplicationSource;

  resumeVersionId?: string;
  coverLetterVersionId?: string;

  prepChecklist?: PrepChecklistItem[];
  debrief?: JobDebrief;

  notes?: string;
  tags: string[];
  software: string[]; // accounting/ERP tools the listing calls for - see SOFTWARE_SUGGESTIONS

  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

// Canonical spellings for the software picker (JobFormModal's
// SoftwareInput). Typing "xero" or "XERO" still matches "Xero" here -
// see normalizeSoftwareName in SoftwareInput.tsx - so the same tool
// never ends up split across two differently-cased tags, which would
// silently break filtering by software on the board.
export const SOFTWARE_SUGGESTIONS = [
  'Xero',
  'MYOB',
  'QuickBooks',
  'SAP',
  'Oracle NetSuite',
  'Sage',
  'Reckon',
  'Microsoft Dynamics 365',
  'Zoho Books',
  'Wave',
  'FreshBooks',
  'Excel (Advanced)',
  'Power BI',
  'Tableau',
] as const;

export type DocumentType = 'resume' | 'cover_letter' | 'cv' | 'portfolio' | 'other';

export const DOCUMENT_TYPES: DocumentType[] = ['resume', 'cover_letter', 'cv', 'portfolio', 'other'];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  resume: 'Resume',
  cover_letter: 'Cover Letter',
  cv: 'CV',
  portfolio: 'Portfolio',
  other: 'Other',
};

// Documents are local-only (stored as base64 in IndexedDB) — not part of
// SyncMeta/the Firestore sync engine, since pushing file blobs through
// Firestore document writes isn't a fit for the current sync design.
export interface DocketDocument {
  id: string;
  name: string;
  type: DocumentType;
  mimeType: string;
  size: number; // bytes
  data: string; // base64-encoded file contents
  createdAt: string;
  updatedAt: string;
}

export interface NewJobInput {
  companyName: string; // resolved to a Company (existing or newly created) by the store
  position: string;
  status: KanbanStatus;
  salary?: string;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  location?: string;
  jobUrl?: string;
  applicationDate?: string;
  deadline?: string;
  priority?: Priority;
  source?: ApplicationSource;
  notes?: string;
  tags: string[];
  software?: string[];
}

// ----------------------------------------------------------------------------
// Message templates — local-only (like DocketDocument above), not part of
// SyncMeta/the sync engine. A personal library of reusable follow-up/
// thank-you/outreach copy with {{placeholder}} tokens filled in per-job
// at send time (see src/lib/templateFill.ts).
// ----------------------------------------------------------------------------
export const TEMPLATE_KINDS = ['follow_up', 'thank_you', 'cold_outreach', 'negotiation', 'other'] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  follow_up: 'Follow-up',
  thank_you: 'Thank-you note',
  cold_outreach: 'Cold outreach',
  negotiation: 'Negotiation',
  other: 'Other',
};

export interface MessageTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  subject?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}
