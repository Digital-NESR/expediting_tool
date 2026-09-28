import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BODY_HTML,
  DEFAULT_SUBJECT,
  highlightPlaceholders,
  htmlToText,
  renderTemplate,
  renderTemplateText,
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
  statementPeriodEndShort: '30 Sep 2026',
  replyBy: '30 October 2026',
  apEmail: 'financeteam.kuwait@nesr.com, financeteam.kuwait@cpvenkuwait.com',
  championName: 'A Champion',
  championEmail: 'champion@nesr.com',
  uploadLink: 'https://portal.example/soa-upload/abc-123',
  senderName: 'M Farhan',
  senderTitle: 'Supply Chain Manager',
  senderEmail: 'mfarhan1@nesr.com',
};

describe('DEFAULT_SUBJECT', () => {
  it('names the vendor and the date it is asking about, and stops there', () => {
    const subject = renderTemplateText(DEFAULT_SUBJECT, VARS);
    expect(subject).toBe('Statement of Account request, Smith & Sons, as of 30 Sep 2026');
  });

  it('is not escaped for a document it is not part of', () => {
    // Khashman O. Al-Dossary & Sons is a real vendor in a live cycle, and read its own name as
    // "Al-Dossary &amp; Sons" in the subject of every letter it was sent.
    expect(renderTemplateText(DEFAULT_SUBJECT, VARS)).not.toContain('&amp;');
    // The body is HTML and must still be escaped.
    expect(renderTemplate('<p>{{vendor_name}}</p>', VARS)).toContain('&amp;');
  });

  it('leaves room for the vendor name, which is the part that identifies the mail', () => {
    // A subject is read truncated, in a list. The old one spent 84 characters on a 12-character
    // vendor name, and the long-form month alone cost six of them.
    expect(renderTemplateText(DEFAULT_SUBJECT, VARS).length).toBeLessThan(
      'Request for Statement of Account, Smith & Sons, as at 30 September 2026'.length,
    );
  });

  it('renders every token it uses', () => {
    expect(unknownTokens(DEFAULT_SUBJECT)).toEqual([]);
    expect(renderTemplateText(DEFAULT_SUBJECT, VARS)).not.toContain('{{');
  });
});

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

  it('sends the supplier to their own upload link, not to a mailbox', () => {
    const out = renderTemplate(DEFAULT_BODY_HTML, VARS);
    expect(out).toContain('https://portal.example/soa-upload/abc-123');
    // The statement comes back through the link so every file arrives already tied to a vendor
    // and a cycle; a workbook emailed in has to be matched up by hand.
    expect(out).not.toMatch(/send the statement by .* to/i);
  });

  it('gives both the champion and AP addresses for questions', () => {
    const out = renderTemplate(DEFAULT_BODY_HTML, VARS);
    expect(out).toContain('champion@nesr.com');
    expect(out).toContain('financeteam.kuwait@nesr.com');
  });

  it('carries the link and both contacts in the Arabic half as well', () => {
    const out = renderTemplate(DEFAULT_BODY_HTML, VARS);
    const arabic = out.slice(out.indexOf('dir="rtl"'));
    expect(arabic).toContain('https://portal.example/soa-upload/abc-123');
    expect(arabic).toContain('champion@nesr.com');
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

describe('the default letter survives being saved', () => {
  // A champion who opens the editor and presses Save runs the whole letter through the sanitiser.
  // If that strips the layout, the design is lost the first time anybody touches it.
  const saved = sanitizeTemplateHtml(DEFAULT_BODY_HTML);

  it('keeps the upload button, not just its link', () => {
    expect(saved).toContain('Upload your completed statement');
    expect(saved).toMatch(/background-color:#307c4c/);
    expect(saved).toMatch(/border-radius:6px/);
    expect(saved).toContain('{{upload_link}}');
  });

  it('keeps the layout tables mail clients need', () => {
    // Outlook ignores most of a style attribute and obeys the old presentational ones.
    expect(saved).toContain('cellpadding="0"');
    expect(saved).toContain('role="presentation"');
    expect(saved).toMatch(/width="640"/);
  });

  it('keeps the attachment callout', () => {
    expect(saved).toContain('An Excel template is attached to this email');
    expect(saved).toMatch(/border-left:4px solid #307c4c/);
  });

  it('keeps the Arabic half right to left', () => {
    expect(saved).toContain('dir="rtl"');
    expect(saved).toContain('lang="ar"');
    expect(saved).toContain('رفع كشف الحساب');
  });

  it('still refuses script in the middle of all that', () => {
    const hostile = DEFAULT_BODY_HTML + '<script>alert(1)</script><img src=x onerror=alert(1)>';
    const out = sanitizeTemplateHtml(hostile);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<img');
  });

  it('keeps dates left-to-right inside the Arabic text', () => {
    // Bidi reordering turns "30 September 2026" into "September 2026 30" in an RTL block.
    const arabic = saved.slice(saved.indexOf('dir="rtl"'));
    expect(arabic).toContain('<span dir="ltr">{{statement_period_end}}</span>');
    expect(arabic).toContain('<span dir="ltr">{{reply_by}}</span>');
  });

  it('renders with every placeholder filled', () => {
    const out = renderTemplate(saved, VARS);
    expect(out).not.toMatch(/\{\{/);
    expect(out).toContain('https://portal.example/soa-upload/abc-123');
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

describe('highlightPlaceholders', () => {
  it('leaves the token visible rather than filling it', () => {
    // The preview used to render a real vendor's name, which read as though that vendor were part
    // of the standard letter.
    const out = highlightPlaceholders('<p>Dear {{vendor_name}},</p>');
    expect(out).toContain('{{vendor_name}}');
    expect(out).toContain('<span');
  });

  it('marks an unknown token differently, because it will go out as written', () => {
    const known = highlightPlaceholders('{{vendor_name}}');
    const unknown = highlightPlaceholders('{{vendor_nme}}');
    expect(known).not.toBe(unknown);
    expect(unknown).toContain('{{vendor_nme}}');
  });

  it('marks every field the letter actually uses', () => {
    const out = highlightPlaceholders(DEFAULT_BODY_HTML);
    // Nothing in the approved letter should come out looking like a mistake.
    expect(out).not.toContain('#FDECEA');
  });

  it('leaves text with no placeholders untouched', () => {
    expect(highlightPlaceholders('<p>Dear Valued Business Partner,</p>')).toBe(
      '<p>Dear Valued Business Partner,</p>',
    );
  });
});
