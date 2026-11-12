import ExcelJS from 'exceljs';
import {
  ASSESSMENT_STATUS_LABEL,
  ICSA_SECTIONS,
  answerKey,
  isGap,
  questionText,
  scoreAnswers,
  sectionsByKeys,
} from './model';
import type { AssessmentWithContext } from './queries';

/**
 * Excel exports, carried over from the artifact: one workbook per respondent (cover, section
 * summary, a sheet per section) and a consolidated workbook across many (overview, compliance by
 * section, open items, all responses).
 */

const GREEN = 'FF2A7E4F';
const PALE = 'FFE8F5EE';

function sheet(
  wb: ExcelJS.Workbook,
  name: string,
  header: string[],
  widths: number[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.columns = header.map((h, i) => ({ header: h, width: widths[i] ?? 16 }));
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  row.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

function band(ws: ExcelJS.Worksheet): void {
  ws.eachRow((row, n) => {
    if (n > 1 && n % 2 === 0)
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE } };
    if (n > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
}

function percentCols(ws: ExcelJS.Worksheet, cols: number[]): void {
  for (const c of cols) ws.getColumn(c).numFmt = '0%';
}

const rateOrDash = (r: number | null) => (r === null ? '-' : r);

export async function assessmentWorkbook(a: AssessmentWithContext): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NESR SC Agents · ICSA';
  const sections = sectionsByKeys(a.sections);
  const score = scoreAnswers(a.answers, sections);

  const cover = wb.addWorksheet('Respondent');
  cover.columns = [{ width: 28 }, { width: 52 }];
  cover.addRow(['Internal Control Self-Assessment (ICSA)']).font = {
    bold: true,
    size: 14,
    color: { argb: GREEN },
  };
  cover.addRow(['Supply Chain Function | Aligned with SOX Controls']);
  cover.addRow([]);
  for (const [k, v] of [
    ['Country / Business Unit', a.country],
    ['Assessment Cycle', a.cycleLabel],
    ['Period', `${a.periodStart} to ${a.periodEnd}`],
    ['Completed By', a.respondentName || a.respondentEmail],
    ['Designation', a.designation || ''],
    ['Sections assigned', sections.map((s) => s.title).join('; ')],
    ['Submitted', a.submittedAt ? a.submittedAt.slice(0, 10) : ''],
    ['Reviewed By', a.reviewedBy || ''],
    ['Status', ASSESSMENT_STATUS_LABEL[a.status]],
  ]) {
    const r = cover.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  }

  const sum = sheet(
    wb,
    'Summary',
    [
      '#',
      'Section',
      'Questions',
      'Yes',
      'No',
      'Partial',
      'N/A',
      'Unanswered',
      'Completion',
      'Compliance',
      'Remarks Missing',
    ],
    [5, 52, 10, 6, 6, 8, 6, 11, 11, 11, 15],
  );
  for (const { section: s, tally: c } of score.per) {
    sum.addRow([
      s.id,
      s.title,
      c.n,
      c.Yes,
      c.No,
      c.Partial,
      c['N/A'],
      c.un,
      c.comp,
      rateOrDash(c.rate),
      c.miss,
    ]);
  }
  const t = score.total;
  sum.addRow([
    '',
    'Total',
    t.n,
    t.Yes,
    t.No,
    t.Partial,
    t['N/A'],
    t.un,
    t.comp,
    rateOrDash(t.rate),
    t.miss,
  ]).font = { bold: true };
  percentCols(sum, [9, 10]);
  band(sum);

  for (const s of sections) {
    const ws = sheet(
      wb,
      `${s.id} ${s.short}`,
      [
        'Ref',
        'Assessment Question',
        'Response',
        'Remarks / Justification',
        'Evidence Reference',
        'Action Plan',
        'Action Owner',
        'Due Date',
      ],
      [7, 70, 11, 50, 28, 36, 18, 12],
    );
    for (const q of s.questions) {
      const ans = a.answers[answerKey(q.ref)] ?? {};
      ws.addRow([
        q.ref,
        questionText(q, a.country),
        ans.r || '',
        ans.m || '',
        ans.rf || '',
        ans.ac || '',
        ans.ow || '',
        ans.du || '',
      ]);
    }
    band(ws);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function consolidatedWorkbook(list: AssessmentWithContext[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NESR SC Agents · ICSA';

  const ov = sheet(
    wb,
    'Overview',
    [
      'Country / BU',
      'Cycle',
      'Respondent',
      'Email',
      'Job Title',
      'Designation',
      'Sections',
      'Status',
      'Submitted',
      'Reviewed By',
      'Completion',
      'Compliance',
      'Yes',
      'No',
      'Partial',
      'N/A',
      'Unanswered',
      'Remarks Missing',
    ],
    [18, 14, 24, 30, 24, 22, 40, 13, 12, 20, 11, 11, 6, 6, 8, 6, 11, 15],
  );
  const bySec = sheet(
    wb,
    'Compliance by Section',
    [
      'Country / BU',
      'Cycle',
      'Respondent',
      'Overall',
      ...ICSA_SECTIONS.map((s) => `${s.id}. ${s.short}`),
    ],
    [18, 14, 24, 10, ...ICSA_SECTIONS.map(() => 16)],
  );
  const open = sheet(
    wb,
    'Open Items',
    [
      'Country / BU',
      'Cycle',
      'Respondent',
      'Ref',
      'Section',
      'Question',
      'Response',
      'Remarks',
      'Action Plan',
      'Action Owner',
      'Due Date',
    ],
    [18, 14, 24, 7, 36, 70, 10, 50, 36, 18, 12],
  );
  const all = sheet(
    wb,
    'All Responses',
    [
      'Country / BU',
      'Cycle',
      'Respondent',
      'Ref',
      'Section',
      'Question',
      'Response',
      'Remarks',
      'Evidence Reference',
    ],
    [18, 14, 24, 7, 36, 70, 10, 50, 28],
  );

  for (const a of list) {
    const sections = sectionsByKeys(a.sections);
    const score = scoreAnswers(a.answers, sections);
    const t = score.total;
    const who = a.respondentName || a.respondentEmail;
    ov.addRow([
      a.country,
      a.cycleLabel,
      who,
      a.respondentEmail,
      a.jobTitle || '',
      a.designation || '',
      sections.map((s) => s.short).join(', '),
      ASSESSMENT_STATUS_LABEL[a.status],
      a.submittedAt ? a.submittedAt.slice(0, 10) : '',
      a.reviewedBy || '',
      t.comp,
      rateOrDash(t.rate),
      t.Yes,
      t.No,
      t.Partial,
      t['N/A'],
      t.un,
      t.miss,
    ]);
    bySec.addRow([
      a.country,
      a.cycleLabel,
      who,
      rateOrDash(t.rate),
      ...ICSA_SECTIONS.map((s) => {
        const p = score.per.find((x) => x.section.key === s.key);
        return p ? rateOrDash(p.tally.rate) : '';
      }),
    ]);
    for (const s of sections) {
      for (const q of s.questions) {
        const ans = a.answers[answerKey(q.ref)] ?? {};
        all.addRow([
          a.country,
          a.cycleLabel,
          who,
          q.ref,
          s.title,
          questionText(q, a.country),
          ans.r || '',
          ans.m || '',
          ans.rf || '',
        ]);
        if (isGap(ans.r)) {
          open.addRow([
            a.country,
            a.cycleLabel,
            who,
            q.ref,
            s.title,
            questionText(q, a.country),
            ans.r,
            ans.m || '',
            ans.ac || '',
            ans.ow || '',
            ans.du || '',
          ]);
        }
      }
    }
  }
  percentCols(ov, [11, 12]);
  percentCols(bySec, [4, 5, 6, 7, 8, 9, 10, 11]);
  for (const ws of [ov, bySec, open, all]) band(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function safeName(s: string): string {
  return (
    s
      .replace(/[^\w-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'ICSA'
  );
}
