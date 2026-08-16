import { format, parseISO, subMonths } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '@/db/database';
import {
  KANBAN_STATUSES,
  STATUS_LABELS,
  type Company,
  type EmploymentType,
  type Job,
  type WorkMode,
} from '@/types/models';
import { formatDate, isStaleJob } from '@/lib/utils';

const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'Onsite',
};

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  casual: 'Casual',
};

// Mirrors the metrics on the Analytics page (src/pages/AnalyticsPage.tsx)
// so the PDF and the on-screen charts never disagree. Kept as a separate
// function rather than importing from the page component, since page
// components aren't meant to be imported as logic modules.
function computeAnalytics(jobs: Job[]) {
  const liveJobs = jobs.filter((j) => !j.deletedAt);

  const total = liveJobs.length;
  const applied = liveJobs.filter((j) => j.status !== 'wishlist' && j.status !== 'ready').length;
  const interviewed = liveJobs.filter(
    (j) =>
      j.status === 'interview' ||
      j.status === 'reference_check' ||
      j.status === 'offer' ||
      j.status === 'accepted',
  ).length;
  const offers = liveJobs.filter((j) => j.status === 'offer' || j.status === 'accepted').length;
  const rejected = liveJobs.filter((j) => j.status === 'rejected').length;
  const staleCount = liveJobs.filter(isStaleJob).length;

  const gaps = liveJobs
    .filter((j) => j.applicationDate && j.interviewDate)
    .map((j) => {
      const applied = parseISO(j.applicationDate!);
      const interview = parseISO(j.interviewDate!);
      return Math.round((interview.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24));
    })
    .filter((d) => d >= 0);
  const avgDaysToInterview = gaps.length
    ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
    : null;

  const statusBreakdown = KANBAN_STATUSES.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: liveJobs.filter((j) => j.status === status).length,
  })).filter((row) => row.count > 0);

  const months = Array.from({ length: 6 }, (_, i) => subMonths(new Date(), 5 - i));
  const monthlyTrend = months.map((month) => {
    const key = format(month, 'yyyy-MM');
    const count = liveJobs.filter((j) => j.applicationDate?.slice(0, 7) === key).length;
    return { label: format(month, 'MMM yyyy'), count };
  });

  const workModeCounts = new Map<string, number>();
  for (const job of liveJobs) {
    if (!job.workMode) continue;
    workModeCounts.set(job.workMode, (workModeCounts.get(job.workMode) ?? 0) + 1);
  }

  const employmentTypeCounts = new Map<string, number>();
  for (const job of liveJobs) {
    if (!job.employmentType) continue;
    employmentTypeCounts.set(job.employmentType, (employmentTypeCounts.get(job.employmentType) ?? 0) + 1);
  }

  return {
    total,
    interviewRate: applied > 0 ? Math.round((interviewed / applied) * 100) : 0,
    offerRate: applied > 0 ? Math.round((offers / applied) * 100) : 0,
    rejectionRate: applied > 0 ? Math.round((rejected / applied) * 100) : 0,
    avgDaysToInterview,
    staleCount,
    statusBreakdown,
    monthlyTrend,
    workModeCounts,
    employmentTypeCounts,
  };
}

export async function exportAnalyticsReportPdf(): Promise<void> {
  const jobs = await db.jobs.toArray();
  const stats = computeAnalytics(jobs);
  const generatedAt = new Date();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 44;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Job Search Report', 40, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  cursorY += 16;
  doc.text(`Generated ${generatedAt.toLocaleString()}`, 40, cursorY);
  doc.setTextColor(0);
  cursorY += 28;

  // KPI summary — laid out as a compact 3-column grid rather than a
  // table, since these read more like headline stats than tabular data.
  const kpis: [string, string][] = [
    ['Total applications', String(stats.total)],
    ['Interview rate', `${stats.interviewRate}%`],
    ['Offer rate', `${stats.offerRate}%`],
    ['Rejection rate', `${stats.rejectionRate}%`],
    ['Avg. days to interview', stats.avgDaysToInterview === null ? '—' : String(stats.avgDaysToInterview)],
    ['Gone quiet (14d+ no activity)', String(stats.staleCount)],
  ];
  const colWidth = (pageWidth - 80) / 3;
  kpis.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * colWidth;
    const y = cursorY + row * 46;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text(label, x, y + 13, { maxWidth: colWidth - 10 });
    doc.setTextColor(0);
  });
  cursorY += Math.ceil(kpis.length / 3) * 46 + 20;

  const addSectionTitle = (title: string) => {
    if (cursorY > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      cursorY = 44;
    }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 40, cursorY);
    doc.setFont('helvetica', 'normal');
    cursorY += 10;
  };

  const finishTable = () => {
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  };

  // Pipeline breakdown
  addSectionTitle('Pipeline by stage');
  const totalForPct = stats.total || 1;
  autoTable(doc, {
    startY: cursorY,
    margin: { left: 40, right: 40 },
    head: [['Stage', 'Count', '% of total']],
    body: stats.statusBreakdown.map((row) => [
      row.label,
      String(row.count),
      `${Math.round((row.count / totalForPct) * 100)}%`,
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [40, 40, 40] },
    theme: 'striped',
    tableWidth: pageWidth - 80,
  });
  finishTable();

  // Monthly trend
  addSectionTitle('Applications by month (last 6 months)');
  autoTable(doc, {
    startY: cursorY,
    margin: { left: 40, right: 40 },
    head: [['Month', 'Applications']],
    body: stats.monthlyTrend.map((row) => [row.label, String(row.count)]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [40, 40, 40] },
    theme: 'striped',
    tableWidth: pageWidth - 80,
  });
  finishTable();

  // Work mode + employment type, side by side if there's data for both
  if (stats.workModeCounts.size > 0) {
    addSectionTitle('Work mode');
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 40, right: 40 },
      head: [['Work mode', 'Count']],
      body: Array.from(stats.workModeCounts.entries()).map(([mode, count]) => [
        WORK_MODE_LABELS[mode as WorkMode] ?? mode,
        String(count),
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [40, 40, 40] },
      theme: 'striped',
      tableWidth: pageWidth - 80,
    });
    finishTable();
  }

  if (stats.employmentTypeCounts.size > 0) {
    addSectionTitle('Employment type');
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 40, right: 40 },
      head: [['Employment type', 'Count']],
      body: Array.from(stats.employmentTypeCounts.entries()).map(([type, count]) => [
        EMPLOYMENT_TYPE_LABELS[type as EmploymentType] ?? type,
        String(count),
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [40, 40, 40] },
      theme: 'striped',
      tableWidth: pageWidth - 80,
    });
    finishTable();
  }

  doc.save(`docket-report-${generatedAt.toISOString().slice(0, 10)}.pdf`);
}

// A one-pager for a single company — every application you've had there,
// your recruiter contacts, and that company's combined activity timeline,
// in one PDF. Meant for prep before a call/interview, or as a record to
// keep after the fact — the whole-pipeline report above is for tracking
// your search overall, this one is for a single relationship.
export async function exportCompanyReportPdf(company: Company): Promise<void> {
  const [allJobs, allRecruiters, allTimelineEvents] = await Promise.all([
    db.jobs.toArray(),
    db.recruiters.toArray(),
    db.timelineEvents.toArray(),
  ]);

  const jobs = allJobs
    .filter((j) => !j.deletedAt && j.companyId === company.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const recruiters = allRecruiters.filter((r) => !r.deletedAt && r.companyId === company.id);
  const jobIds = new Set(jobs.map((j) => j.id));
  const timeline = allTimelineEvents
    .filter((t) => !t.deletedAt && jobIds.has(t.jobId))
    .sort((a, b) => a.date.localeCompare(b.date));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedAt = new Date();
  let cursorY = 44;

  const ensureRoom = (minSpace: number) => {
    if (cursorY > pageHeight - minSpace) {
      doc.addPage();
      cursorY = 44;
    }
  };

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(company.name, 40, cursorY);
  doc.setFont('helvetica', 'normal');
  cursorY += 18;

  doc.setFontSize(9);
  doc.setTextColor(120);
  const subtitleParts = [company.industry, company.website].filter(Boolean);
  if (subtitleParts.length) {
    doc.text(subtitleParts.join(' · '), 40, cursorY);
    cursorY += 14;
  }
  doc.text(`Generated ${generatedAt.toLocaleString()}`, 40, cursorY);
  doc.setTextColor(0);
  cursorY += 24;

  if (company.notes) {
    ensureRoom(80);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes', 40, cursorY);
    doc.setFont('helvetica', 'normal');
    cursorY += 14;
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(company.notes, pageWidth - 80);
    doc.text(noteLines, 40, cursorY);
    cursorY += noteLines.length * 12 + 16;
  }

  const addSectionTitle = (title: string) => {
    ensureRoom(120);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 40, cursorY);
    doc.setFont('helvetica', 'normal');
    cursorY += 10;
  };

  const finishTable = () => {
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  };

  // Applications
  addSectionTitle(`Applications (${jobs.length})`);
  if (jobs.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('No applications logged for this company yet.', 40, cursorY);
    doc.setTextColor(0);
    cursorY += 24;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 40, right: 40 },
      head: [['Position', 'Status', 'Applied', 'Location', 'Salary']],
      body: jobs.map((j) => [
        j.position + (isStaleJob(j) ? ' (gone quiet)' : ''),
        STATUS_LABELS[j.status],
        j.applicationDate ? formatDate(j.applicationDate) : '—',
        j.location ?? '—',
        j.salary ?? '—',
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [40, 40, 40] },
      theme: 'striped',
      tableWidth: pageWidth - 80,
    });
    finishTable();
  }

  // Recruiter contacts
  if (recruiters.length > 0) {
    addSectionTitle(`Contacts (${recruiters.length})`);
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 40, right: 40 },
      head: [['Name', 'Position', 'Email', 'Phone', 'Next follow-up']],
      body: recruiters.map((r) => [
        r.name,
        r.position ?? '—',
        r.email ?? '—',
        r.phone ?? '—',
        r.nextFollowUp ? formatDate(r.nextFollowUp) : '—',
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [40, 40, 40] },
      theme: 'striped',
      tableWidth: pageWidth - 80,
    });
    finishTable();
  }

  // Combined activity timeline across every job at this company
  if (timeline.length > 0) {
    addSectionTitle('Activity timeline');
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 40, right: 40 },
      head: [['Date', 'Position', 'Event', 'Note']],
      body: timeline.map((t) => {
        const job = jobs.find((j) => j.id === t.jobId);
        return [formatDate(t.date), job?.position ?? '—', t.label, t.note ?? ''];
      }),
      styles: { fontSize: 8.5, cellPadding: 5 },
      headStyles: { fillColor: [40, 40, 40] },
      theme: 'striped',
      tableWidth: pageWidth - 80,
    });
    finishTable();
  }

  const safeName = company.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`docket-${safeName}-${generatedAt.toISOString().slice(0, 10)}.pdf`);
}
