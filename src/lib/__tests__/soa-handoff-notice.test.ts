import { describe, expect, it } from 'vitest';
import { handoffNoticeEmail } from '@/lib/soa/email-template';

const BASE = {
  countryName: 'Abu Dhabi',
  cycleLabel: 'Q3 2026',
  vendors: 297,
  statementsReceived: 214,
  coveragePct: 78,
  closedBy: 'Raghad Yousef',
  portalUrl: 'https://scagents.nesr.com/soa-consolidation',
  attachmentName: 'NESR-SOA-Consolidated-AUH-Q3-2026.xlsx',
};

/**
 * The one message that goes to a colleague rather than a supplier, and the one that hands work
 * over. The figures it quotes are the figures AP will be asked about.
 */
describe('handoffNoticeEmail', () => {
  it('leads with the three figures the receiving team is accountable for', () => {
    const html = handoffNoticeEmail(BASE);
    expect(html).toContain('297');
    expect(html).toContain('214');
    expect(html).toContain('78%');
    expect(html).toContain('Vendors in scope');
  });

  it('names the attached file, so nobody goes looking for it', () => {
    expect(handoffNoticeEmail(BASE)).toContain('NESR-SOA-Consolidated-AUH-Q3-2026.xlsx');
  });

  it('says so plainly when the file could not be attached', () => {
    // The close is already committed by then. Silence would have AP waiting for an attachment
    // that is never coming.
    const html = handoffNoticeEmail({ ...BASE, attachmentName: null });
    expect(html).toContain('could not be attached');
    expect(html).not.toContain('Consolidated statement attached');
  });

  it('draws no button when there is no portal address configured', () => {
    const html = handoffNoticeEmail({ ...BASE, portalUrl: null });
    expect(html).not.toContain('Open the cycle in the portal');
    expect(html).not.toContain('href=""');
  });

  it('says where consolidation ends and reconciliation begins', () => {
    // Out of scope for this tool by decision, and the handover is where that has to be said.
    expect(handoffNoticeEmail(BASE)).toContain('Reconciling these balances');
  });

  it('escapes a country or person whose name carries markup', () => {
    const html = handoffNoticeEmail({ ...BASE, closedBy: 'A & B <script>' });
    expect(html).toContain('A &amp; B &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('is wrapped in the same shell as every other message', () => {
    const html = handoffNoticeEmail(BASE);
    expect(html).toContain('#307c4c');
    expect(html).toContain('letter-spacing:2px">NESR<');
  });
});
