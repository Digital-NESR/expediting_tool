import { NextRequest, NextResponse } from 'next/server';
import laptopProcurementPool from '@/lib/db-laptop';
import { getLaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import type { LaptopRequestStatus } from '@/types/laptopProcurement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Read-only status lookup for external workflows (n8n) to poll before escalating an
 * approval reminder — e.g. after a Wait node, check whether a request is still
 * actually sitting with the same stage before emailing the next escalation contact,
 * instead of trusting the stale status captured when the original webhook fired.
 * Authenticated with the same shared secret used for the outbound approval webhook.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = process.env.N8N_LAPTOP_PROCUREMENT_WEBHOOK_SECRET?.trim();
  if (secret && req.headers.get('x-laptop-procurement-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isFinite(requestId)) {
    return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 });
  }

  try {
    const { rows } = await laptopProcurementPool.query(
      `SELECT id, reference_number, status, pending_with FROM laptop_requests WHERE id = $1 LIMIT 1`,
      [requestId],
    );
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const status = row.status as LaptopRequestStatus;
    return NextResponse.json({
      id: row.id,
      reference_number: row.reference_number,
      status,
      pending_with: row.pending_with,
      stage: getLaptopApprovalStage(status),
    });
  } catch (err) {
    console.error('[Laptop Procurement] status lookup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
