import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BODY_HTML,
  DEFAULT_SUBJECT,
  htmlToText,
  renderTemplate,
  sanitizeTemplateHtml,
  unknownTokens,
  type TemplateVars,
} from '@/lib/soa/email-template';
import { resolveAddresses } from '@/lib/soa/recipients';

const VARS: TemplateVars = {
  date: '26 September 2026',
  vendorName: 'Smith & Sons',
  vendorNo: '0001102483',
  countryName: 'Kuwait',
  cycleLabel: 'Q3 2026',
  statementPeriodEnd: '30 September 2026',
  replyBy: '30 October 2026',
  apEmail: 'financeteam.kuwait@nesr.com',
  championName: 'A Champion',
  senderName: 'M Farhan',
  senderTitle: 'Supply Chain Manager',
  senderMobile: '',
  senderEmail: 'mfarhan1@nesr.com',
};

describe('renderTemplate', () => {
  it('fills every placeholder the approved letter uses', () => {
    const out = renderTemplate(DEFAULT_BODY_HTML, VARS);
    expect(out).not.toMatch(/\{\{/);
    expect(out).toContain('30 October 2026');
    expect(out).toContain('financeteam.kuwait@nesr.com');
  });

  it('escapes values rather than trusting them as markup', () => {
    // A vendor name with an ampersand is ordinary and would otherwise produce invalid HTML.
    expect(renderTemplate('<p>{{vendor_name}}</p>', VARS)).toBe('<p>Smith &amp; Sons</p>');
    const hostile = { ...VARS, vendorName: '<script>alert(1)</script>' };
    expect(renderTemplate('<p>{{vendor_name}}</p>', hostile)).not.toContain('<script>');
  });

  it('leaves an unknown token visible instead of blanking it', () => {
    // A typo should show up in the preview, not vanish into a silent gap in the letter.
    expect(renderTemplate('<p>{{vendor_nme}}</p>', VARS)).toBe('<p>{{vendor_nme}}</p>');
    expect(unknownTokens('{{vendor_nme}} {{vendor_name}}')).toEqual(['vendor_nme']);
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplate('{{ reply_by }}', VARS)).toBe('30 October 2026');
  });

  it('renders the subject too', () => {
    expect(renderTemplate(DEFAULT_SUBJECT, VARS)).toContain('Smith &amp; Sons');
  });
});

describe('sanitizeTemplateHtml', () => {
  it('keeps what the letter is made of', () => {
    const html = '<h2>Request</h2><p><strong>Bold</strong></p><ul><li>One</li></ul>';
    expect(sanitizeTemplateHtml(html)).toBe(html);
  });

  it('keeps the Arabic half readable right to left', () => {
    const out = sanitizeTemplateHtml('<div dir="rtl" lang="ar"><p>طلب كشف حساب</p></div>');
    expect(out).toContain('dir="rtl"');
    expect(out).toContain('lang="ar"');
  });

  it('keeps mailto links, which the letter depends on', () => {
    expect(sanitizeTemplateHtml('<a href="mailto:ap@nesr.com">ap</a>')).toContain('mailto:ap@nesr.com');
  });

  it('strips script and event handlers', () => {
    // The stored HTML is rendered back into our own pages, so this is sanitised on the way in.
    expect(sanitizeTemplateHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
    expect(sanitizeTemplateHtml('<p onclick="alert(1)">ok</p>')).toBe('<p>ok</p>');
    expect(sanitizeTemplateHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
  });

  it('drops images and iframes, which have no business in this letter', () => {
    expect(sanitizeTemplateHtml('<p>a</p><img src="x"><iframe src="y"></iframe>')).toBe('<p>a</p>');
  });
});

describe('htmlToText', () => {
  it('produces a plain-text alternative', () => {
    expect(htmlToText('<h2>Request</h2><p>Dear <strong>Partner</strong></p>')).toContain('Dear Partner');
    expect(htmlToText('<p>a</p>')).not.toContain('<');
  });
});

describe('resolveAddresses', () => {
  const none = new Set<string>();

  it('merges the directory with what a champion added, labelling each', () => {
    const { to } = resolveAddresses(['ap@vendor.com'], ['finance@vendor.com'], none);
    expect(to).toEqual([
      { email: 'ap@vendor.com', origin: 'directory' },
      { email: 'finance@vendor.com', origin: 'added' },
    ]);
  });

  it('drops NESR addresses the supplier master happens to carry', () => {
    const { to, droppedInternal } = resolveAddresses(['ap@vendor.com', 'staff@nesr.com'], [], none);
    expect(to.map((a) => a.email)).toEqual(['ap@vendor.com']);
    expect(droppedInternal).toEqual(['staff@nesr.com']);
  });

  it('keeps a NESR address a champion typed in deliberately', () => {
    const { to, droppedInternal } = resolveAddresses([], ['colleague@nesr.com'], none);
    expect(to).toEqual([{ email: 'colleague@nesr.com', origin: 'added' }]);
    expect(droppedInternal).toEqual([]);
  });

  it('honours a suppression over both sources', () => {
    const gone = new Set(['dead@vendor.com']);
    const { to } = resolveAddresses(['dead@vendor.com', 'ap@vendor.com'], ['dead@vendor.com'], gone);
    expect(to.map((a) => a.email)).toEqual(['ap@vendor.com']);
  });

  it('deduplicates across the two sources, keeping the directory label', () => {
    const { to } = resolveAddresses(['ap@vendor.com'], ['ap@vendor.com'], none);
    expect(to).toEqual([{ email: 'ap@vendor.com', origin: 'directory' }]);
  });

  it('matches on the address, not its spelling', () => {
    const { to } = resolveAddresses(['  AP@Vendor.com '], [], new Set(['ap@vendor.com']));
    expect(to).toEqual([]);
  });

  it('reports a vendor with nothing to write to as empty rather than throwing', () => {
    expect(resolveAddresses([], [], none)).toEqual({ to: [], droppedInternal: [] });
  });
});
