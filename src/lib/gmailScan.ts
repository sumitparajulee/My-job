// Scans the connected Gmail inbox for messages that look like an
// interview invite, an offer, or a rejection, and matches them back to
// an active job by sender - either an exact match against a recruiter's
// saved email, or a fallback match against the job's company website
// domain. No new OAuth scope is needed: googleAuth.ts already requests
// gmail.modify, which covers everything this scan does (list + read
// metadata; nothing here modifies anything).
//
// This only ever reads header metadata (From/Subject/Date) plus the
// short snippet Gmail itself generates - never the full message body -
// to keep the classification heuristics operating on the same short
// text a person would see scanning their inbox list, not the whole
// email content.

import type { Company, Job, Recruiter } from '@/types/models';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface ScannedEmail {
  id: string;
  fromEmail: string;
  fromDomain: string;
  fromName: string;
  subject: string;
  snippet: string;
  date: string; // ISO
}

function headerValue(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseFromHeader(raw: string): { name: string; email: string; domain: string } {
  const match = raw.match(/<([^>]+)>/);
  const email = (match ? match[1] : raw).trim().toLowerCase();
  const name = match ? raw.slice(0, match.index).trim().replace(/^"|"$/g, '') : '';
  const domain = email.split('@')[1] ?? '';
  return { name, email, domain };
}

// Extracts a bare comparable hostname from whatever format a company's
// website field happens to be in ("acme.com", "https://www.acme.com/",
// etc). Returns null rather than throwing on anything unparseable so a
// single malformed website field can't abort matching for every company.
export function domainFromWebsite(website?: string): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// Fetches the most recent inbox messages (excluding Promotions/Social,
// which are never going to be a recruiter reply) and pulls out just the
// header fields the classifier needs. Each message is a separate
// metadata-only GET - Gmail's list endpoint alone doesn't include
// From/Subject - so this is intentionally capped by `maxResults` to
// keep a scan to a couple dozen requests, not hundreds.
export async function listRecentInboxMessages(
  token: string,
  maxResults = 25,
): Promise<ScannedEmail[]> {
  const q = encodeURIComponent('in:inbox newer_than:21d -category:promotions -category:social');
  const listRes = await fetch(`${GMAIL_BASE}/messages?maxResults=${maxResults}&q=${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) throw new Error(`Could not list Gmail messages (${listRes.status})`);
  const listData = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = (listData.messages ?? []).map((m) => m.id);

  const emails: ScannedEmail[] = [];
  for (const id of ids) {
    const res = await fetch(
      `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    // A single message failing to fetch (deleted mid-scan, odd
    // encoding, etc.) shouldn't sink the rest of the scan.
    if (!res.ok) continue;
    const data = (await res.json()) as {
      id: string;
      snippet?: string;
      internalDate?: string;
      payload?: { headers?: { name: string; value: string }[] };
    };
    const headers = data.payload?.headers ?? [];
    const { email: fromEmail, domain: fromDomain, name: fromName } = parseFromHeader(
      headerValue(headers, 'From'),
    );
    emails.push({
      id: data.id,
      fromEmail,
      fromDomain,
      fromName,
      subject: headerValue(headers, 'Subject'),
      snippet: data.snippet ?? '',
      date: data.internalDate
        ? new Date(Number(data.internalDate)).toISOString()
        : new Date().toISOString(),
    });
  }
  return emails;
}

export type SignalType = 'interview' | 'offer' | 'rejection';

export const SIGNAL_LABELS: Record<SignalType, string> = {
  interview: 'Looks like an interview invite',
  offer: 'Looks like an offer',
  rejection: 'Looks like a rejection',
};

// Deliberately simple substring matching over the subject + snippet,
// checked in most-specific-first order (an offer email mentioning
// "next steps" shouldn't get classified as an interview). This is meant
// to surface candidates for the person to confirm or dismiss, not to
// silently change anything on its own - see matchEmailsToJobs, which
// only ever produces suggestions.
const OFFER_PHRASES = [
  'pleased to offer',
  'excited to offer',
  'job offer',
  'offer letter',
  'welcome to the team',
  'formal offer',
];
const REJECTION_PHRASES = [
  'unfortunately',
  'not moving forward',
  'other candidates',
  'regret to inform',
  'not been successful',
  'decided not to proceed',
  'will not be moving forward',
  'pursue other applicants',
];
const INTERVIEW_PHRASES = [
  'interview',
  'phone screen',
  'schedule a call',
  'schedule a chat',
  'meet the team',
  'video call',
  'next steps in the process',
  'availability this week',
];

export function classifyEmail(subject: string, snippet: string): SignalType | null {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (OFFER_PHRASES.some((p) => text.includes(p))) return 'offer';
  if (REJECTION_PHRASES.some((p) => text.includes(p))) return 'rejection';
  if (INTERVIEW_PHRASES.some((p) => text.includes(p))) return 'interview';
  return null;
}

export interface InboxSignal {
  email: ScannedEmail;
  job: Job;
  type: SignalType;
}

// Matches classified emails to a job in two passes: an exact match on a
// recruiter's saved email address first (most specific - that recruiter
// is tied to a particular job or company), falling back to the job's
// company website domain. Jobs already at a terminal status (rejected,
// accepted, archived) are excluded - there's nothing useful to suggest
// updating them to.
export function matchEmailsToJobs(
  emails: ScannedEmail[],
  jobs: Job[],
  companies: Company[],
  recruiters: Recruiter[],
): InboxSignal[] {
  const TERMINAL: Job['status'][] = ['rejected', 'accepted', 'archived'];
  const activeJobs = jobs.filter((j) => !j.deletedAt && !j.archivedAt && !TERMINAL.includes(j.status));

  const signals: InboxSignal[] = [];
  for (const email of emails) {
    const type = classifyEmail(email.subject, email.snippet);
    if (!type) continue;

    const recruiterMatch = recruiters.find(
      (r) => !r.deletedAt && r.email?.toLowerCase() === email.fromEmail,
    );

    let job =
      recruiterMatch &&
      (activeJobs.find((j) => j.recruiterId === recruiterMatch.id) ??
        (recruiterMatch.companyId
          ? activeJobs.find((j) => j.companyId === recruiterMatch.companyId)
          : undefined));

    if (!job) {
      job = activeJobs.find((j) => {
        const company = companies.find((c) => c.id === j.companyId);
        const domain = domainFromWebsite(company?.website);
        return Boolean(domain) && domain === email.fromDomain;
      });
    }

    if (job) signals.push({ email, job, type });
  }
  return signals;
}
