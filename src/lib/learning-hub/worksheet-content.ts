/**
 * The eight learner worksheets, as form definitions.
 *
 * Each one was a Word document: a release's case studies, the tasks that go with them, and a set of
 * boxes to type into. They are now JSON in `./worksheets`, generated from those documents rather
 * than retyped — 8 sheets, 40 sections, 41 tasks, 53 questions, 42 grids and 144 input fields would
 * not have survived being transcribed by hand.
 *
 * Statically imported, not read from disk. These ship to a serverless runtime where the repo is not
 * on the filesystem, so the bundler has to see the dependency.
 *
 * Nothing here is scored. A worksheet is optional, and the only thing the hub does with a submission
 * is count it toward full completion and show it to an admin. That is why there is no answer key in
 * the field definitions: the worked answers are a separate block list, revealed after submission.
 */
import l1 from './worksheets/l1.json';
import l2r1 from './worksheets/l2-r1.json';
import l2r2 from './worksheets/l2-r2.json';
import l2r3 from './worksheets/l2-r3.json';
import l3r1 from './worksheets/l3-r1.json';
import l3r2 from './worksheets/l3-r2.json';
import l3r3 from './worksheets/l3-r3.json';
import l3r4 from './worksheets/l3-r4.json';

/** A box the learner types into. `rows` is how much room the original document left for it. */
export interface WorksheetField {
  id: string;
  kind: 'short_text' | 'long_text';
  rows: number;
}

/** One cell of a fillable grid: either a value the sheet gives, or a box to complete. */
export type GridCell = { v: string; input?: undefined } | { input: true; v?: undefined };

export type WorksheetBlock =
  | { type: 'prose'; text: string }
  /** A boxed aside — the standing instruction, or a note to read only after part (a). */
  | { type: 'callout'; text: string }
  | { type: 'subheading'; text: string }
  /** Bullets that belong to the section rather than to one task. */
  | { type: 'prompts'; items: string[] }
  /** Case material: read it, do not edit it. */
  | { type: 'caseTable'; head: string[]; rows: string[][] }
  /** A table the learner completes — the ABC classification, the discounting grid. */
  | { type: 'grid'; id: string; head: string[]; rows: GridCell[][] }
  | {
      type: 'task';
      id: string;
      title: string;
      /** How long the video suggests pausing for, in minutes; null where it does not say. */
      pauseMinutes: number | null;
      prompts: string[];
      field: WorksheetField | null;
      /** Set instead of `field` when the answer is the grid that follows — its id. */
      answeredBy?: string;
      /** Set instead of `field` when the sheet sends the learner to another section to work it. */
      redirect?: string;
    }
  | {
      type: 'question';
      id: string;
      /** The original's own numbering, "a)" or "3.", kept so the sheet reads like the document. */
      mark: string;
      text: string;
      field: WorksheetField | null;
      answeredBy?: string;
      redirect?: string;
    }
  /** A labelled box belonging to no task — the commitments at the end of Level 1. */
  | { type: 'freeNote'; label: string | null; field: WorksheetField };

export interface WorksheetSection {
  id: string;
  title: string;
  blocks: WorksheetBlock[];
}

/** One section of the worked-answers document, shown once the learner has submitted. */
export interface WorksheetAnswerSection {
  title: string;
  blocks: WorksheetBlock[];
}

export interface Worksheet {
  key: string;
  /** "Level 2 — Practitioner". */
  level: string;
  /** The release's short name, e.g. "Plan the Demand". */
  title: string;
  /** Matched against `learning_courses.title`. */
  courseTitle: string;
  /** Matched against `learning_modules.title` — this is what ties a sheet to a release. */
  moduleTitle: string;
  intro: string;
  sections: WorksheetSection[];
  answers: WorksheetAnswerSection[];
}

/* The JSON is generated, so its shape is known; TypeScript cannot infer a discriminated union from
   an imported literal, which is the whole of what this cast is doing. */
const SHEETS = [l1, l2r1, l2r2, l2r3, l3r1, l3r2, l3r3, l3r4] as unknown as Worksheet[];

export const WORKSHEETS: readonly Worksheet[] = SHEETS;

/** The worksheet for a release, found by its module title. Most modules have none. */
export function worksheetForModule(moduleTitle: string): Worksheet | null {
  const want = moduleTitle.trim().toLowerCase();
  return SHEETS.find((w) => w.moduleTitle.trim().toLowerCase() === want) ?? null;
}

export function worksheetByKey(key: string): Worksheet | null {
  return SHEETS.find((w) => w.key === key) ?? null;
}

/** Every field on a sheet, in reading order — for counting answers and for the admin export. */
export function worksheetFields(
  sheet: Worksheet,
): { id: string; label: string; section: string; kind: 'text' | 'grid' }[] {
  const out: { id: string; label: string; section: string; kind: 'text' | 'grid' }[] = [];
  for (const section of sheet.sections) {
    for (const block of section.blocks) {
      if (block.type === 'task' && block.field)
        out.push({ id: block.field.id, label: block.title, section: section.title, kind: 'text' });
      else if (block.type === 'question' && block.field)
        out.push({
          id: block.field.id,
          label: `${block.mark} ${block.text}`,
          section: section.title,
          kind: 'text',
        });
      else if (block.type === 'freeNote')
        out.push({
          id: block.field.id,
          label: block.label ?? 'Notes',
          section: section.title,
          kind: 'text',
        });
      else if (block.type === 'grid')
        out.push({ id: block.id, label: block.head.join(' · '), section: section.title, kind: 'grid' });
    }
  }
  return out;
}

/**
 * How much of a sheet has been answered.
 *
 * A grid counts as answered when any of its cells is, not when all of them are: the discounting
 * table has fifteen boxes and somebody who filled twelve has plainly engaged with it. Nothing here
 * gates anything — it drives a progress bar and the "you have N unanswered" line before submitting.
 */
export function worksheetProgress(
  sheet: Worksheet,
  answers: Record<string, unknown>,
): { answered: number; total: number } {
  const fields = worksheetFields(sheet);
  let answered = 0;
  for (const f of fields) {
    const v = answers[f.id];
    if (f.kind === 'grid') {
      if (v && typeof v === 'object' && Object.values(v).some((c) => String(c ?? '').trim()))
        answered += 1;
    } else if (String(v ?? '').trim()) {
      answered += 1;
    }
  }
  return { answered, total: fields.length };
}
