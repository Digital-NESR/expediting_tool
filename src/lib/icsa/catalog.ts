import { cache } from 'react';
import type { QueryResultRow } from 'pg';
import { sql } from './db';
import type { Catalog } from './model';

/**
 * The question bank, read from icsa_sections / icsa_questions (see migration 003). A plain
 * module like ./queries: server code loads the bank here and hands it to the pure functions in
 * ./model and to client components as a prop.
 */

export interface AdminQuestion {
  id: number;
  ref: string;
  text: string;
  sort: number;
  active: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export interface AdminSection {
  key: string;
  num: number;
  short: string;
  title: string;
  sort: number;
  active: boolean;
  questions: AdminQuestion[];
}

async function readBank(): Promise<AdminSection[]> {
  const [sections, questions] = await Promise.all([
    sql<QueryResultRow[]>(
      `SELECT key, num, short, title, sort, active FROM icsa_sections ORDER BY sort, num`,
    ),
    sql<QueryResultRow[]>(
      `SELECT id, section_key, ref, text, sort, active, updated_by, updated_at
         FROM icsa_questions ORDER BY sort, id`,
    ),
  ]);
  return sections.map((s) => ({
    key: s.key,
    num: Number(s.num),
    short: s.short,
    title: s.title,
    sort: Number(s.sort),
    active: !!s.active,
    questions: questions
      .filter((q) => q.section_key === s.key)
      .map((q) => ({
        id: Number(q.id),
        ref: q.ref,
        text: q.text,
        sort: Number(q.sort),
        active: !!q.active,
        updatedBy: q.updated_by ?? null,
        updatedAt: q.updated_at,
      })),
  }));
}

/** Everything, archived included, for the admin panel's question editor. */
export async function loadBankForAdmin(): Promise<AdminSection[]> {
  return readBank();
}

/**
 * The live bank: active sections with their active questions, in order. Cached for one request,
 * so a page that scores many forms reads the tables once.
 */
export const loadCatalog = cache(async (): Promise<Catalog> => {
  const bank = await readBank();
  return bank
    .filter((s) => s.active)
    .map((s) => ({
      key: s.key,
      id: s.num,
      short: s.short,
      title: s.title,
      questions: s.questions.filter((q) => q.active).map((q) => ({ ref: q.ref, text: q.text })),
    }));
});
