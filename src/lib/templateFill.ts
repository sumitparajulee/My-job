import type { Company, Job, MessageTemplate, Recruiter } from '@/types/models';
import { formatDate } from '@/lib/utils';

// The tokens a template body/subject can reference. Documented here (not
// just in the UI) since it's the single source of truth both the
// TemplateFormModal hint text and fillTemplate itself read from.
export const TEMPLATE_PLACEHOLDERS = [
  { token: '{{position}}', description: "the job's position title" },
  { token: '{{company}}', description: "the job's company name" },
  { token: '{{recruiterName}}', description: 'the linked recruiter\u2019s name, if any' },
  { token: '{{myName}}', description: 'left as-is \u2014 fill in by hand before sending' },
  { token: '{{date}}', description: "today's date" },
] as const;

export interface FillContext {
  job?: Job;
  company?: Company;
  recruiter?: Recruiter;
}

function fillString(input: string, ctx: FillContext): string {
  const values: Record<string, string> = {
    position: ctx.job?.position ?? '',
    company: ctx.company?.name ?? '',
    recruiterName: ctx.recruiter?.name ?? '',
    date: formatDate(new Date().toISOString()),
  };
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}

export function fillTemplate(
  template: MessageTemplate,
  ctx: FillContext,
): { subject: string; body: string } {
  return {
    subject: template.subject ? fillString(template.subject, ctx) : '',
    body: fillString(template.body, ctx),
  };
}
