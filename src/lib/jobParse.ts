import type { JobDraft } from '@/store/useUIStore';

// Heuristic-only — there's no LLM in the loop here, just pattern matching
// over whatever text got pasted (a job board listing, an email, a Slack
// message). It's meant to save re-typing the obvious fields, not to be
// perfectly accurate; JobFormModal opens right after with everything
// still editable, so a wrong guess costs a click, not a bad record.

const URL_RE = /https?:\/\/[^\s)"'<>]+/i;

// "Senior Designer at Acme Inc." / "Senior Designer - Acme Inc." / "Senior Designer | Acme Inc."
const TITLE_AT_COMPANY_RE = /^(.{2,80}?)\s+(?:at|@|-|\u2013|\|)\s+(.{2,80})$/;

// "Company: Acme Inc." style label lines, seen in copy-pasted listings/emails.
const LABELED_COMPANY_RE = /^\s*(?:company|employer|organisation|organization)\s*[:-]\s*(.+)$/i;
const LABELED_POSITION_RE = /^\s*(?:position|role|title|job title)\s*[:-]\s*(.+)$/i;
const LABELED_LOCATION_RE = /^\s*location\s*[:-]\s*(.+)$/i;

const REMOTE_RE = /\b(remote|work from home|wfh)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const LOCATION_LINE_RE = /^([A-Za-z .'\u2013-]+,\s*[A-Za-z .']+)$/; // "Sydney, NSW" / "Melbourne, Australia"

function firstNonEmptyLines(text: string, count: number): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, count);
}

/**
 * Best-effort extraction of position/company/location/jobUrl from raw
 * pasted text. Never throws — worst case, every field comes back empty
 * and the person fills the form in by hand like before.
 */
export function parseJobPosting(raw: string): JobDraft {
  const text = raw.trim();
  const draft: JobDraft = {};
  if (!text) return draft;

  const urlMatch = text.match(URL_RE);
  if (urlMatch) draft.jobUrl = urlMatch[0];

  const lines = text.split('\n').map((l) => l.trim());

  // Pass 1: explicit "Label: value" lines, if the source used them.
  for (const line of lines) {
    const posMatch = line.match(LABELED_POSITION_RE);
    if (posMatch && !draft.position) draft.position = posMatch[1].trim();
    const compMatch = line.match(LABELED_COMPANY_RE);
    if (compMatch && !draft.companyName) draft.companyName = compMatch[1].trim();
    const locMatch = line.match(LABELED_LOCATION_RE);
    if (locMatch && !draft.location) draft.location = locMatch[1].trim();
  }

  // Pass 2: "Title at Company" on one of the first few lines — the most
  // common shape for a job board listing's headline.
  if (!draft.position || !draft.companyName) {
    for (const line of firstNonEmptyLines(text, 6)) {
      const m = line.match(TITLE_AT_COMPANY_RE);
      if (m) {
        draft.position ??= m[1].trim();
        draft.companyName ??= m[2].trim();
        break;
      }
    }
  }

  // Pass 3: fall back to the very first non-empty line as the position
  // (job board headlines are almost always the title on its own line),
  // and a short "Sydney, NSW"-style line anywhere near the top as location.
  if (!draft.position) {
    const first = firstNonEmptyLines(text, 1)[0];
    if (first && first.length <= 100 && !URL_RE.test(first)) draft.position = first;
  }

  if (!draft.location) {
    for (const line of firstNonEmptyLines(text, 10)) {
      if (LOCATION_LINE_RE.test(line)) {
        draft.location = line;
        break;
      }
    }
    if (!draft.location && REMOTE_RE.test(text)) draft.location = 'Remote';
    else if (!draft.location && HYBRID_RE.test(text)) draft.location = 'Hybrid';
  }

  return draft;
}
