import type { QueryResultRow } from 'pg';
import { safesignPool, ensureSafeSignSchema } from './db';
import {
  compliance,
  displayStatus,
  type AttachmentMode,
  type DisplayStatus,
  type RequestStatus,
  type ResponseType,
} from './model';
import { todayRiyadh } from './delivery';
import { dateOnly } from './supplier-access';

/**
 * Reads behind the staff pages. Callers check access first (requireSafeSignUser); nothing here does,
 * which is why this is a plain module and not a `'use server'` file.
 */

export interface Topic {
  id: number;
  name: string;
  description: string;
  archived: boolean;
}

export interface Contact {
  id?: number;
  name: string;
  email: string;
  kind: 'to' | 'cc';
}

export interface Vendor {
  id: number;
  name: string;
  category: string;
  vendorCode: string;
  active: boolean;
  contacts: Contact[];
}

export interface SafeSignUser {
  email: string;
  name: string;
  role: 'sender';
}

const iso = (v: unknown): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);

export async function listTopics(includeArchived = false): Promise<Topic[]> {
  await ensureSafeSignSchema();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT id, name, COALESCE(description, '') AS description, archived
       FROM ss_topics ${includeArchived ? '' : 'WHERE NOT archived'}
      ORDER BY archived, name`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    description: String(r.description),
    archived: Boolean(r.archived),
  }));
}

export async function listVendors(includeInactive = true): Promise<Vendor[]> {
  await ensureSafeSignSchema();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT v.id, v.name, v.category, COALESCE(v.vendor_code, '') AS vendor_code, v.active,
            COALESCE(json_agg(json_build_object('id', c.id, 'name', COALESCE(c.name, ''),
                     'email', c.email, 'kind', c.kind) ORDER BY c.kind DESC, c.id)
                     FILTER (WHERE c.id IS NOT NULL), '[]') AS contacts
       FROM ss_vendors v
       LEFT JOIN ss_vendor_contacts c ON c.vendor_id = v.id
      ${includeInactive ? '' : 'WHERE v.active'}
      GROUP BY v.id
      ORDER BY v.category, v.name`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    category: String(r.category),
    vendorCode: String(r.vendor_code),
    active: Boolean(r.active),
    contacts: (r.contacts as Contact[]).map((c) => ({ ...c, id: Number(c.id) })),
  }));
}

export async function listUsers(): Promise<SafeSignUser[]> {
  await ensureSafeSignSchema();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT email, COALESCE(name, '') AS name, role FROM ss_users ORDER BY role, email`,
  );
  return rows.map((r) => ({
    email: String(r.email),
    name: String(r.name),
    role: String(r.role) as SafeSignUser['role'],
  }));
}

export interface CommunicationSummary {
  id: number;
  topicId: number;
  topicName: string;
  title: string;
  responseType: ResponseType;
  deadline: string;
  status: 'draft' | 'sent' | 'closed';
  createdAt: string;
  sentAt: string | null;
  total: number;
  done: number;
  overdue: number;
  toReview: number;
}

export async function listCommunications(topicId?: number): Promise<CommunicationSummary[]> {
  await ensureSafeSignSchema();
  const today = todayRiyadh();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT c.id, c.topic_id, t.name AS topic_name, c.title, c.response_type, c.deadline,
            c.status, c.created_at, c.sent_at,
            COUNT(r.id)::int AS total,
            COUNT(r.id) FILTER (WHERE r.status = 'completed')::int AS done,
            COUNT(r.id) FILTER (WHERE r.status = 'under_review')::int AS to_review,
            COUNT(r.id) FILTER (WHERE r.status IN ('pending', 'changes_requested')
                                  AND c.status = 'sent' AND c.deadline < $1::date)::int AS overdue
       FROM ss_communications c
       JOIN ss_topics t ON t.id = c.topic_id
       LEFT JOIN ss_requests r ON r.communication_id = c.id
      ${topicId ? 'WHERE c.topic_id = $2' : ''}
      GROUP BY c.id, t.name
      ORDER BY COALESCE(c.sent_at, c.created_at) DESC`,
    topicId ? [today, topicId] : [today],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    topicId: Number(r.topic_id),
    topicName: String(r.topic_name),
    title: String(r.title),
    responseType: String(r.response_type) as ResponseType,
    deadline: dateOnly(r.deadline),
    status: String(r.status) as CommunicationSummary['status'],
    createdAt: iso(r.created_at) ?? '',
    sentAt: iso(r.sent_at),
    total: Number(r.total),
    done: Number(r.done),
    overdue: Number(r.overdue),
    toReview: Number(r.to_review),
  }));
}

export interface TopicCard {
  id: number;
  name: string;
  description: string;
  communications: number;
  done: number;
  total: number;
  pct: number;
  overdue: number;
  toReview: number;
}

/** One card per topic: sent requests completed out of sent requests. */
export async function topicCards(): Promise<TopicCard[]> {
  const [topics, comms] = await Promise.all([listTopics(), listCommunications()]);
  return topics.map((t) => {
    const mine = comms.filter((c) => c.topicId === t.id && c.status !== 'draft');
    const done = mine.reduce((s, c) => s + c.done, 0);
    const total = mine.reduce((s, c) => s + c.total, 0);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      communications: mine.length,
      done,
      total,
      pct: total ? Math.round((done / total) * 100) : 0,
      overdue: mine.reduce((s, c) => s + c.overdue, 0),
      toReview: mine.reduce((s, c) => s + c.toReview, 0),
    };
  });
}

export interface MatrixCell {
  requestId: number;
  status: DisplayStatus;
  respondedAt: string | null;
  respondedName: string | null;
}

export interface TopicMatrix {
  topic: Topic;
  columns: { id: number; title: string; deadline: string; status: string }[];
  rows: {
    vendorId: number;
    vendorName: string;
    category: string;
    cells: Record<number, MatrixCell>;
    done: number;
    total: number;
  }[];
}

/** Suppliers down the side, this topic's communications across the top. */
export async function topicMatrix(topicId: number): Promise<TopicMatrix | null> {
  await ensureSafeSignSchema();
  const topics = await listTopics(true);
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) return null;
  const today = todayRiyadh();

  const { rows: cols } = await safesignPool.query<QueryResultRow>(
    `SELECT id, title, deadline, status FROM ss_communications
      WHERE topic_id = $1 AND status <> 'draft' ORDER BY sent_at`,
    [topicId],
  );
  const { rows: reqs } = await safesignPool.query<QueryResultRow>(
    `SELECT r.id, r.communication_id, r.vendor_id, r.status, r.responded_at, r.responded_name,
            v.name AS vendor_name, v.category, c.deadline
       FROM ss_requests r
       JOIN ss_communications c ON c.id = r.communication_id
       JOIN ss_vendors v ON v.id = r.vendor_id
      WHERE c.topic_id = $1 AND c.status <> 'draft'
      ORDER BY v.category, v.name`,
    [topicId],
  );

  const byVendor = new Map<number, TopicMatrix['rows'][number]>();
  for (const r of reqs) {
    const vid = Number(r.vendor_id);
    let row = byVendor.get(vid);
    if (!row) {
      row = { vendorId: vid, vendorName: String(r.vendor_name), category: String(r.category), cells: {}, done: 0, total: 0 };
      byVendor.set(vid, row);
    }
    const status = String(r.status) as RequestStatus;
    row.cells[Number(r.communication_id)] = {
      requestId: Number(r.id),
      status: displayStatus(status, dateOnly(r.deadline), today),
      respondedAt: iso(r.responded_at),
      respondedName: r.responded_name ? String(r.responded_name) : null,
    };
    row.total += 1;
    if (status === 'completed') row.done += 1;
  }

  return {
    topic,
    columns: cols.map((c) => ({
      id: Number(c.id),
      title: String(c.title),
      deadline: dateOnly(c.deadline),
      status: String(c.status),
    })),
    rows: [...byVendor.values()],
  };
}

export interface DocumentMeta {
  id: number;
  filename: string;
  mime: string;
  sizeBytes: number;
  isLetter: boolean;
}

export interface ResponseFile {
  id: number;
  round: number;
  kind: string;
  filename: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface EventItem {
  kind: string;
  actor: string;
  at: string;
  detail: Record<string, unknown>;
}

export interface RequestDetail {
  id: number;
  vendorId: number;
  vendorName: string;
  category: string;
  status: RequestStatus;
  display: DisplayStatus;
  sentTo: string[];
  sentCc: string[];
  sentAt: string | null;
  respondedAt: string | null;
  respondedEmail: string | null;
  respondedName: string | null;
  respondedTitle: string | null;
  respondedIp: string | null;
  comment: string | null;
  reminderCount: number;
  lastRemindedAt: string | null;
  files: ResponseFile[];
  events: EventItem[];
}

export interface CommunicationDetail {
  id: number;
  topicId: number;
  topicName: string;
  title: string;
  message: string;
  responseType: ResponseType;
  attachments: AttachmentMode;
  deadline: string;
  remindDaysBefore: number[];
  overdueEveryDays: number;
  status: 'draft' | 'sent' | 'closed';
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  sentBy: string | null;
  closedAt: string | null;
  documents: DocumentMeta[];
  requests: RequestDetail[];
  compliance: { done: number; total: number; pct: number };
}

export async function getCommunication(id: number): Promise<CommunicationDetail | null> {
  await ensureSafeSignSchema();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT c.*, t.name AS topic_name FROM ss_communications c
       JOIN ss_topics t ON t.id = c.topic_id WHERE c.id = $1`,
    [id],
  );
  const c = rows[0];
  if (!c) return null;
  const today = todayRiyadh();
  const deadline = dateOnly(c.deadline);

  const [{ rows: docs }, { rows: reqs }, { rows: files }, { rows: events }] = await Promise.all([
    safesignPool.query<QueryResultRow>(
      `SELECT id, filename, mime, size_bytes, is_letter FROM ss_documents
        WHERE communication_id = $1 ORDER BY is_letter DESC, id`,
      [id],
    ),
    safesignPool.query<QueryResultRow>(
      `SELECT r.*, v.name AS vendor_name, v.category FROM ss_requests r
         JOIN ss_vendors v ON v.id = r.vendor_id
        WHERE r.communication_id = $1 ORDER BY v.category, v.name`,
      [id],
    ),
    safesignPool.query<QueryResultRow>(
      `SELECT f.id, f.request_id, f.round, f.kind, f.filename, f.size_bytes, f.uploaded_by, f.uploaded_at
         FROM ss_response_files f JOIN ss_requests r ON r.id = f.request_id
        WHERE r.communication_id = $1 ORDER BY f.round DESC, f.id`,
      [id],
    ),
    safesignPool.query<QueryResultRow>(
      `SELECT e.request_id, e.kind, e.actor, e.at, e.detail
         FROM ss_events e JOIN ss_requests r ON r.id = e.request_id
        WHERE r.communication_id = $1 ORDER BY e.at DESC LIMIT 2000`,
      [id],
    ),
  ]);

  const requests: RequestDetail[] = reqs.map((r) => {
    const status = String(r.status) as RequestStatus;
    const rid = Number(r.id);
    return {
      id: rid,
      vendorId: Number(r.vendor_id),
      vendorName: String(r.vendor_name),
      category: String(r.category),
      status,
      display: displayStatus(status, deadline, today, r.sent_at !== null),
      sentTo: (r.sent_to as string[]) ?? [],
      sentCc: (r.sent_cc as string[]) ?? [],
      sentAt: iso(r.sent_at),
      respondedAt: iso(r.responded_at),
      respondedEmail: r.responded_email ?? null,
      respondedName: r.responded_name ?? null,
      respondedTitle: r.responded_title ?? null,
      respondedIp: r.responded_ip ?? null,
      comment: r.response_comment ?? null,
      reminderCount: Number(r.reminder_count ?? 0),
      lastRemindedAt: iso(r.last_reminded_at),
      files: files
        .filter((f) => Number(f.request_id) === rid)
        .map((f) => ({
          id: Number(f.id),
          round: Number(f.round),
          kind: String(f.kind),
          filename: String(f.filename),
          sizeBytes: Number(f.size_bytes),
          uploadedBy: String(f.uploaded_by),
          uploadedAt: iso(f.uploaded_at) ?? '',
        })),
      events: events
        .filter((e) => Number(e.request_id) === rid)
        .map((e) => ({
          kind: String(e.kind),
          actor: String(e.actor),
          at: iso(e.at) ?? '',
          detail: (e.detail as Record<string, unknown>) ?? {},
        })),
    };
  });

  return {
    id: Number(c.id),
    topicId: Number(c.topic_id),
    topicName: String(c.topic_name),
    title: String(c.title),
    message: String(c.message ?? ''),
    responseType: String(c.response_type) as ResponseType,
    attachments: String(c.attachments) as AttachmentMode,
    deadline,
    remindDaysBefore: ((c.remind_days_before as number[]) ?? []).map(Number),
    overdueEveryDays: Number(c.overdue_every_days),
    status: String(c.status) as CommunicationDetail['status'],
    createdBy: String(c.created_by),
    createdAt: iso(c.created_at) ?? '',
    sentAt: iso(c.sent_at),
    sentBy: c.sent_by ?? null,
    closedAt: iso(c.closed_at),
    documents: docs.map((d) => ({
      id: Number(d.id),
      filename: String(d.filename),
      mime: String(d.mime),
      sizeBytes: Number(d.size_bytes),
      isLetter: Boolean(d.is_letter),
    })),
    requests,
    compliance: compliance(requests.filter((r) => r.sentAt).map((r) => r.status)),
  };
}
