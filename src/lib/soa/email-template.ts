import sanitizeHtml from 'sanitize-html';

/**
 * The statement-request letter, its placeholders, and the rules for storing champion-edited HTML.
 *
 * A plain module, not `'use server'`, see the note in `./db`.
 *
 * The wording below is the approved bilingual text and is the seed every country starts from. It
 * is not merely cosmetic: it is the notice that tells a vendor their account will be treated as
 * reconciled if they stay silent, so the dates and the reply-to mailbox in it have to be right.
 * That is exactly why it is editable by the champion who signs it rather than buried in an
 * automation nobody in Supply Chain can read.
 */

/** A token the champion can drop into the letter; resolved per vendor at send time. */
export interface TemplateVars {
  date: string;
  vendorName: string;
  vendorNo: string;
  countryName: string;
  cycleLabel: string;
  statementPeriodEnd: string;
  /** The same date short enough for a subject line, "30 Sep 2026". */
  statementPeriodEndShort: string;
  replyBy: string;
  apEmail: string;
  championName: string;
  /** Every champion address for the country, for questions. */
  championEmail: string;
  /** Where this vendor uploads their statement. Unique to them and to this cycle. */
  uploadLink: string;
  senderName: string;
  senderTitle: string;
  senderEmail: string;
}

/** What each token means, for the "insert a field" list beside the editor. */
export const PLACEHOLDERS: { token: string; label: string; from: string }[] = [
  { token: 'date', label: "Today's date", from: 'the day the request is sent' },
  { token: 'vendor_name', label: 'Vendor name', from: 'the vendor being written to' },
  { token: 'vendor_no', label: 'Vendor number', from: 'SAP supplier code' },
  { token: 'country_name', label: 'Country', from: 'the country running the cycle' },
  { token: 'cycle_label', label: 'Cycle', from: 'e.g. Q3 2026' },
  { token: 'statement_period_end', label: 'Statement period end', from: "the cycle's period end" },
  {
    token: 'statement_period_end_short',
    label: 'Statement period end, short',
    from: "the cycle's period end, as 30 Sep 2026",
  },
  { token: 'reply_by', label: 'Reply-by date', from: "the cycle's submission deadline" },
  { token: 'ap_email', label: 'AP mailbox', from: 'the AP contacts for the country' },
  { token: 'champion_email', label: 'Champion email', from: 'the champions for the country' },
  { token: 'upload_link', label: 'Upload link', from: "this vendor's own upload page" },
  { token: 'champion_name', label: 'SOA champion', from: 'the champion for the country' },
  { token: 'sender_name', label: 'Sender name', from: 'the signed-in user' },
  { token: 'sender_title', label: 'Sender job title', from: 'the employee directory' },
  { token: 'sender_email', label: 'Sender email', from: 'the signed-in user' },
];

/* Leaner than "Request for Statement of Account, {{vendor_name}}, as at 30 September 2026",
   which spent eighty-four characters before the vendor's name had been read. Nothing is dropped:
   the same three facts in fewer words, with the date in the short form a subject line wants. */
export const DEFAULT_SUBJECT =
  'Statement of Account request, {{vendor_name}}, as of {{statement_period_end_short}}';

export const DEFAULT_BODY_HTML = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F6F4;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:#FFFFFF;border:1px solid #E2E6E2;border-radius:8px;font-family:Segoe UI, Arial, sans-serif;color:#2B2B2B">

<tr><td style="background-color:#307c4c;padding:20px 28px;border-radius:8px">
<div style="color:#FFFFFF;font-size:16px;font-weight:bold;letter-spacing:2px">NESR</div>
<div style="color:#CFE3D6;font-size:12px">Statement of Account</div>
</td></tr>

<tr><td style="padding:28px">
<div style="font-size:12px;color:#8A8A8A;padding-bottom:12px">{{date}}</div>
<h2 style="font-size:20px;color:#1D4F31;margin:0">Request for Statement of Account</h2>
<p style="font-size:14px;line-height:1.6">Dear Valued Business Partner,</p>
<p style="font-size:14px;line-height:1.6">As part of our periodic governance to ensure accounting alignment, we are reconciling our accounts and would appreciate it if you could provide us with an updated statement of account for our transactions with your company.</p>
<p style="font-size:14px;line-height:1.6">We require this information to ensure that our records are accurate, up to date and any anomaly addressed.</p>
<p style="font-size:14px;line-height:1.6"><strong>Please include the following in your statement:</strong></p>
<ul style="font-size:14px;line-height:1.7">
<li>All unpaid invoices issued to us</li>
<li>Any outstanding balances</li>
<li>Credit notes or adjustments, if any</li>
<li>Any unbilled amount</li>
</ul>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F6F2;border-left:4px solid #307c4c;border-radius:4px;margin:8px 0">
<tr><td style="padding:16px 18px">
<div style="font-size:14px;font-weight:bold;color:#1D4F31;padding-bottom:6px">An Excel template is attached to this email</div>
<div style="font-size:13px;line-height:1.6">Please complete it and return it using the button below. Your statement should cover the period up to <strong>{{statement_period_end}}</strong>. Use the attached template rather than your own format, so that the figures can be reconciled automatically.</div>
</td></tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:20px 0">
<tr><td align="center">
<a href="{{upload_link}}" style="display:inline-block;background-color:#307c4c;color:#FFFFFF;font-size:15px;font-weight:bold;padding:14px 32px;border-radius:6px;text-decoration:none">Upload your completed statement</a>
<div style="font-size:12px;color:#8A8A8A;padding-top:10px">This link is unique to your company. Please do not forward it.</div>
</td></tr></table>

<p style="font-size:14px;line-height:1.6"><strong>Please note</strong></p>
<ul style="font-size:14px;line-height:1.7">
<li>The completed statement is due by <strong>{{reply_by}}</strong>.</li>
<li>The button above is the only way to return it. Statements sent by any other route cannot be processed.</li>
<li>If the required statement is not provided in the attached format before that date, the account will be considered reconciled.</li>
<li>Any outstanding balance prior to {{statement_period_end}} not highlighted in the statement will not be processed for payment in the future.</li>
</ul>
<p style="font-size:14px;line-height:1.6">For any questions or clarification, please contact {{champion_name}} at <a href="mailto:{{champion_email}}" style="color:#307c4c">{{champion_email}}</a>, or our Accounts Payable team at <a href="mailto:{{ap_email}}" style="color:#307c4c">{{ap_email}}</a>.</p>
<p style="font-size:14px;line-height:1.6">Thank you for your prompt attention to this matter. We value our partnership with your company and look forward to your swift response.</p>
<p style="font-size:14px;line-height:1.6">Thank you!<br /><strong>Supply Chain and Accounts Payable team</strong><br />NESR</p>
<div style="font-size:11px;color:#9A9A9A;padding-top:14px">If the button does not work, copy this address into your browser: {{upload_link}}</div>
</td></tr>

<tr><td style="border-top:1px solid #E2E6E2;padding:28px" dir="rtl" lang="ar">
<h2 style="font-size:20px;color:#1D4F31;margin:0">طلب كشف حساب</h2>
<p style="font-size:14px;line-height:1.7">عزيزي الشريك التجاري</p>
<p style="font-size:14px;line-height:1.7">نظرا للتحقق الدوري الذي نقوم به لضمان توافق الحسابات، نحن نقوم بمراجعة حساباتنا وسنكون ممتنين لو تمكنتم من تقديم تقرير كشف حساب محدث للمعاملات بين شركتكم وبيننا.</p>
<p style="font-size:14px;line-height:1.7">إننا نحتاج الى هذه المعلومات للتأكد من أن سجلاتنا دقيقة ومحدثة، وللتعامل مع أي تباينات.</p>
<p style="font-size:14px;line-height:1.7"><strong>يرجى ارفاق التفاصيل التالية في الكشف:</strong></p>
<ul style="font-size:14px;line-height:1.8">
<li>جميع الفواتير الغير مدفوعة التي أصدرت لنا</li>
<li>أي ارصدة متبقية</li>
<li>ملاحظات اشعار الإتمان (Credit Note) او التعديل، إن وجد</li>
<li>أي مبلغ غير مفوتر</li>
</ul>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F6F2;border-right:4px solid #307c4c;border-radius:4px;margin:8px 0">
<tr><td style="padding:16px 18px">
<div style="font-size:14px;font-weight:bold;color:#1D4F31;padding-bottom:6px">نموذج اكسل مرفق بهذه الرسالة</div>
<div style="font-size:13px;line-height:1.7">يرجى تعبئته وإرساله عبر الزر أدناه. يجب أن يغطي كشف الحساب الفترة حتى <strong><span dir="ltr">{{statement_period_end}}</span></strong>. نرجو استخدام النموذج المرفق وليس نموذجكم الخاص، حتى تتم مطابقة الأرقام آليا.</div>
</td></tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:20px 0">
<tr><td align="center">
<a href="{{upload_link}}" style="display:inline-block;background-color:#307c4c;color:#FFFFFF;font-size:15px;font-weight:bold;padding:14px 32px;border-radius:6px;text-decoration:none">رفع كشف الحساب</a>
<div style="font-size:12px;color:#8A8A8A;padding-top:10px">هذا الرابط خاص بشركتكم، يرجى عدم إعادة توجيهه.</div>
</td></tr></table>

<p style="font-size:14px;line-height:1.7"><strong>ملاحظات:</strong></p>
<ul style="font-size:14px;line-height:1.8">
<li>الموعد النهائي لتقديم كشف الحساب هو <strong><span dir="ltr">{{reply_by}}</span></strong>.</li>
<li>الزر أعلاه هو الطريقة الوحيدة لإرسال الكشف.</li>
<li>في حال عدم تقديم كشف الحساب المطلوب في التنسيق المذكور قبل الموعد المحدد، سيتم اعتبار الحسابات مطابقة.</li>
<li>أي رصيد متبقي قبل <span dir="ltr">{{statement_period_end}}</span> ولم يتم ذكره في تقرير الحساب لن يتم معالجته للدفع في المستقبل.</li>
</ul>
<p style="font-size:14px;line-height:1.7">لأي استفسار أو توضيح، يرجى التواصل مع {{champion_name}} على <a href="mailto:{{champion_email}}" style="color:#307c4c">{{champion_email}}</a>، أو مع قسم الحسابات الدائنة على <a href="mailto:{{ap_email}}" style="color:#307c4c">{{ap_email}}</a>.</p>
<p style="font-size:14px;line-height:1.7">شكراً لكم!<br /><strong>فريق سلسلة التوريد والحسابات الدائنة</strong><br />شركة نسر</p>
</td></tr>

</table>
</td></tr></table>`;

/**
 * The branded shell every message from this tool sits in.
 *
 * Extracted so the verification code and the handoff notice look like the statement request rather
 * than like three different systems wrote them. A supplier who has just read a carefully laid-out
 * letter and then receives a bare line of text has reason to wonder which one is genuine, and a
 * verification code is exactly the message people are taught to be suspicious of.
 */
export function emailShell(subtitle: string, inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F6F4;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:#FFFFFF;border:1px solid #E2E6E2;border-radius:8px;font-family:Segoe UI, Arial, sans-serif;color:#2B2B2B">
<tr><td style="background-color:#307c4c;padding:20px 28px;border-radius:8px">
<div style="color:#FFFFFF;font-size:16px;font-weight:bold;letter-spacing:2px">NESR</div>
<div style="color:#CFE3D6;font-size:12px">${subtitle}</div>
</td></tr>
<tr><td style="padding:28px">${inner}</td></tr>
</table>
</td></tr></table>`;
}

/**
 * The notice Accounts Payable gets when a champion closes a country.
 *
 * The one message in the system that goes to a colleague rather than a supplier, and the last one
 * still hand-rolled. It is also the one that hands work over, so the figures it quotes are the
 * figures the receiving team will be asked about: they read as a panel rather than as a sentence.
 */
export function handoffNoticeEmail(input: {
  countryName: string;
  cycleLabel: string;
  vendors: number;
  statementsReceived: number;
  coveragePct: number;
  closedBy: string;
  portalUrl: string | null;
  attachmentName: string | null;
}): string {
  const figure = (label: string, value: string) =>
    `<td width="33%" align="center" style="padding:14px 8px;background-color:#F1F6F2;border:1px solid #CFE3D6;border-radius:8px">
<div style="font-size:24px;font-weight:bold;color:#1D4F31">${escapeHtml(value)}</div>
<div style="font-size:11px;color:#58595B;padding-top:4px">${escapeHtml(label)}</div></td>`;

  return emailShell(
    'Statement of Account',
    `<h2 style="font-size:20px;color:#1D4F31;margin:0">${escapeHtml(input.countryName)} is closed and ready for you</h2>
<p style="font-size:14px;line-height:1.6">The ${escapeHtml(input.cycleLabel)} statement of account cycle for <strong>${escapeHtml(input.countryName)}</strong> has been reconciled against the statements collected and handed over by ${escapeHtml(input.closedBy)}.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:8px 0">
<tr>${figure('Vendors in scope', String(input.vendors))}<td width="8"></td>${figure('Statements received', String(input.statementsReceived))}<td width="8"></td>${figure('Coverage', `${input.coveragePct}%`)}</tr>
</table>

${
  input.attachmentName
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:8px 0">
<tr><td style="background-color:#FAFBFA;border:1px solid #E2E6E2;border-radius:8px;padding:16px 18px">
<div style="font-size:13px;font-weight:bold;color:#1D4F31">Consolidated statement attached</div>
<div style="font-size:13px;line-height:1.6;padding-top:4px">${escapeHtml(input.attachmentName)} carries every invoice line every supplier returned, in the sixteen-column format you already work in. Where a supplier answered by email or had nothing outstanding, their line says so and points you at the correspondence.</div>
</td></tr></table>`
    : `<p style="font-size:13px;line-height:1.6;color:#8A4B00">The consolidated file could not be attached to this message. It is on the Consolidation screen in the portal.</p>`
}

${
  input.portalUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="padding:8px 0">
<tr><td align="center" style="background-color:#307c4c;border-radius:6px">
<a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none">Open the cycle in the portal</a>
</td></tr></table>`
    : ''
}

<p style="font-size:13px;line-height:1.6">In the portal you can read every statement as it was returned, the invoice lines taken from each one, and the evidence trail behind the coverage figure above.</p>
<p style="font-size:13px;line-height:1.6;color:#8A8A8A">Reconciling these balances against the ledger is yours. This tool collects and consolidates what the suppliers sent; it does not compare it to what NESR believes.</p>`,
  );
}

/** The one-time code sent to a supplier proving they can read one of the vendor's addresses. */
export function verificationCodeEmail(input: {
  code: string;
  vendorName: string;
  cycleLabel: string;
  minutes: number;
}): string {
  return emailShell(
    'Statement of Account',
    `<h2 style="font-size:20px;color:#1D4F31;margin:0">Your verification code</h2>
<p style="font-size:14px;line-height:1.6">Use this code to confirm it is you, and the upload page for <strong>${input.vendorName}</strong> will open.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:8px 0">
<tr><td align="center" style="background-color:#F1F6F2;border:1px solid #CFE3D6;border-radius:8px;padding:22px">
<div style="font-size:36px;font-weight:bold;color:#1D4F31;letter-spacing:8px">${input.code}</div>
<div style="font-size:12px;color:#8A8A8A;padding-top:8px">Expires in ${input.minutes} minutes</div>
</td></tr></table>
<p style="font-size:14px;line-height:1.6">This is for the ${input.cycleLabel} statement of account request. The code can be used once.</p>
<p style="font-size:13px;line-height:1.6;color:#8A8A8A">If you did not ask for this code, you can ignore this message. Nobody can upload anything without it, and we will not ask you for it by phone or email.</p>
<p style="font-size:14px;line-height:1.6">Thank you!<br /><strong>Supply Chain and Accounts Payable team</strong><br />NESR</p>`,
  );
}

/**
 * What a champion is allowed to save.
 *
 * The stored HTML is rendered back into the portal as well as mailed out, so it is untrusted input
 * to our own pages and is sanitised on the way in rather than on the way out. Sanitising at render
 * time means every future render site has to remember to do it. The allow-list is what the letter
 * actually needs: text, emphasis, lists, tables, links, and the `dir`/`lang` pair that makes the
 * Arabic half read right to left.
 */
const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span', 'strong', 'b', 'em', 'i', 'u',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  /* Mail clients are a decade behind browsers: Outlook ignores most of a `style` attribute and
     obeys the old presentational attributes, so a letter that holds its shape needs both. None of
     these carries script, and the stored HTML is sanitised on the way in rather than at each
     render, so widening them here is a layout decision rather than a security one. */
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    table: ['width', 'align', 'border', 'cellpadding', 'cellspacing', 'role', 'bgcolor'],
    td: ['width', 'align', 'valign', 'colspan', 'rowspan', 'bgcolor', 'height'],
    th: ['width', 'align', 'valign', 'colspan', 'rowspan', 'bgcolor'],
    tr: ['align', 'valign', 'bgcolor', 'height'],
    '*': ['dir', 'lang', 'style'],
  },
  // mailto and tel matter here; everything else that can carry script does not.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedStyles: {
    '*': {
      'text-align': [/^left$|^right$|^center$|^justify$/],
      'font-weight': [/^bold$|^normal$|^\d{3}$/],
      'text-decoration': [/^underline$|^line-through$|^none$/],
      'font-family': [/^[-a-zA-Z0-9,'" ]+$/],
      'font-size': [/^\d{1,3}(px|pt|%|em)$/],
      'font-style': [/^italic$|^normal$/],
      'line-height': [/^[\d.]{1,5}(px|pt|%|em)?$/],
      'background-color': [/^#[0-9a-fA-F]{3,8}$/],
      background: [/^#[0-9a-fA-F]{3,8}$/],
      color: [/^#[0-9a-fA-F]{3,8}$/],
      padding: [/^[\dpxemt% ]{1,40}$/],
      'padding-top': [/^\d{1,3}(px|pt|em|%)$/],
      'padding-bottom': [/^\d{1,3}(px|pt|em|%)$/],
      'padding-left': [/^\d{1,3}(px|pt|em|%)$/],
      'padding-right': [/^\d{1,3}(px|pt|em|%)$/],
      margin: [/^[\dpxemtau% ]{1,40}$/],
      border: [/^[\dpxa-z# ]{1,40}$/],
      'border-top': [/^[\dpxa-z# ]{1,40}$/],
      'border-left': [/^[\dpxa-z# ]{1,40}$/],
      'border-radius': [/^\d{1,3}(px|%)$/],
      'border-collapse': [/^collapse$|^separate$/],
      width: [/^\d{1,4}(px|%)$/],
      'max-width': [/^\d{1,4}(px|%)$/],
      display: [/^block$|^inline-block$|^inline$|^none$/],
      'vertical-align': [/^top$|^middle$|^bottom$/],
      'letter-spacing': [/^[\d.]{1,4}(px|em)$/],
      'white-space': [/^nowrap$|^normal$/],
    },
  },
  disallowedTagsMode: 'discard',
};

/** Clean champion-authored HTML before it is stored. */
export function sanitizeTemplateHtml(html: string): string {
  return sanitizeHtml(html ?? '', ALLOWED).trim();
}

/** Strip every tag, used for the plain-text alternative part of the email. */
export function htmlToText(html: string): string {
  return sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g;

function valueFor(name: string, vars: TemplateVars): string | undefined {
  const map: Record<string, string> = {
    date: vars.date,
    vendor_name: vars.vendorName,
    vendor_no: vars.vendorNo,
    country_name: vars.countryName,
    cycle_label: vars.cycleLabel,
    statement_period_end: vars.statementPeriodEnd,
    statement_period_end_short: vars.statementPeriodEndShort,
    reply_by: vars.replyBy,
    ap_email: vars.apEmail,
    champion_email: vars.championEmail,
    upload_link: vars.uploadLink,
    champion_name: vars.championName,
    sender_name: vars.senderName,
    sender_title: vars.senderTitle,
    sender_email: vars.senderEmail,
  };
  return map[name];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Substitute the placeholders.
 *
 * Values are HTML-escaped: a vendor name carrying an ampersand is common and would otherwise
 * produce invalid markup, and a value is data rather than markup in any case. An unknown token is
 * left exactly as written rather than blanked, so a typo shows up in the preview as
 * `{{vendor_nme}}` instead of disappearing into a silent gap in the letter.
 */
export function renderTemplate(html: string, vars: TemplateVars): string {
  return (html ?? '').replace(TOKEN, (whole, name: string) => {
    const value = valueFor(name, vars);
    return value === undefined ? whole : escapeHtml(value);
  });
}

/**
 * The same substitution for somewhere that is not HTML. The subject line, in practice.
 *
 * A subject rendered through `renderTemplate` is escaped for a document it will never be part of,
 * and the supplier reads the markup: "Khashman O. Al-Dossary &amp; Sons" went out in the subject
 * of every letter to a vendor with an ampersand in its name.
 */
export function renderTemplateText(template: string, vars: TemplateVars): string {
  return (template ?? '').replace(TOKEN, (whole, name: string) => {
    const value = valueFor(name, vars);
    return value === undefined ? whole : value;
  });
}

/**
 * Mark up the placeholders instead of filling them.
 *
 * The preview used to render against the country's largest vendor, which read as though that
 * vendor were part of the standard letter, a champion editing it would reasonably wonder why
 * somebody else's name was in their template. Showing the tokens themselves says plainly which
 * parts are written once and which are resolved per vendor at send time.
 *
 * An unknown token is marked differently rather than left to blend in: it will go out to the
 * supplier exactly as written, so it needs to look wrong here.
 */
export function highlightPlaceholders(html: string): string {
  const known = new Set(PLACEHOLDERS.map((p) => p.token));
  return (html ?? '').replace(TOKEN, (whole, name: string) =>
    known.has(name)
      ? `<span style="background:#E3F0E8;color:#1D4F31;border-radius:3px;padding:0 3px">${whole}</span>`
      : `<span style="background:#FDECEA;color:#B71C1C;border-radius:3px;padding:0 3px">${whole}</span>`,
  );
}

/** Tokens present in the text that nothing can fill, surfaced before a send, not after. */
export function unknownTokens(html: string): string[] {
  const known = new Set(PLACEHOLDERS.map((p) => p.token));
  const found = new Set<string>();
  for (const m of (html ?? '').matchAll(TOKEN)) if (!known.has(m[1])) found.add(m[1]);
  return [...found];
}
