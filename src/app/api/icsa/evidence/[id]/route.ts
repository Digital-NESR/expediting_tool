import { NextRequest, NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { attachmentContentDisposition } from '@/lib/contentDisposition';
import { getIcsaActor } from '@/lib/icsa/access';
import { icsaPool, sql } from '@/lib/icsa/db';
import { getAssessment } from '@/lib/icsa/queries';

/** Download one evidence file. Whoever can open the assessment can read its evidence. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getIcsaActor();
  if (!actor) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await params;

  const [row] = await sql<QueryResultRow[]>(
    `SELECT assessment_id FROM icsa_evidence WHERE id = ?`,
    [Number(id) || 0],
  );
  if (!row || !(await getAssessment(actor, Number(row.assessment_id)))) {
    return new NextResponse('Not found', { status: 404 });
  }

  /* Read the bytes straight off the pool: the shared helper JSON-serialises rows, which would
     turn a bytea Buffer into {type, data}. */
  const { rows } = await icsaPool.query(
    `SELECT file_name, content_type, data FROM icsa_evidence WHERE id = $1`,
    [Number(id)],
  );
  const f = rows[0];
  if (!f) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(f.data as Buffer), {
    headers: {
      'Content-Type': f.content_type || 'application/octet-stream',
      'Content-Disposition': attachmentContentDisposition(f.file_name),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
