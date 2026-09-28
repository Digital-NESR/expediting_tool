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
  { token: 'reply_by', label: 'Reply-by date', from: "the cycle's submission deadline" },
  { token: 'ap_email', label: 'AP mailbox', from: 'the AP contacts for the country' },
  { token: 'champion_email', label: 'Champion email', from: 'the champions for the country' },
  { token: 'upload_link', label: 'Upload link', from: "this vendor's own upload page" },
  { token: 'champion_name', label: 'SOA champion', from: 'the champion for the country' },
  { token: 'sender_name', label: 'Sender name', from: 'the signed-in user' },
  { token: 'sender_title', label: 'Sender job title', from: 'the employee directory' },
  { token: 'sender_email', label: 'Sender email', from: 'the signed-in user' },
];

export const DEFAULT_SUBJECT =
  'Request for Statement of Account, {{vendor_name}}, as at {{statement_period_end}}';

export const DEFAULT_BODY_HTML = `<p>Date: {{date}}</p>
<h3>Attention!</h3>
<h2>Request for Statement of Account</h2>
<p>Dear Valued Business Partner,</p>
<p>As part of our periodic governance to ensure accounting alignment, we are reconciling our accounts and would appreciate it if you could provide us with an updated statement of account for our transactions with your company.</p>
<p>We require this information to ensure that our records are accurate, up to date and any anomaly addressed.</p>
<p>Please include the following details in the statement:</p>
<ul>
<li>All Unpaid invoices issued to us</li>
<li>Any outstanding balances</li>
<li>Credit notes or adjustments, if any</li>
<li>Any unbilled amount</li>
</ul>
<p><strong>Take Note</strong></p>
<ul>
<li>The statement period should cover till <strong>{{statement_period_end}}</strong> and must be returned in the attached Excel template</li>
<li>Please upload the completed statement by <strong>{{reply_by}}</strong> using your own secure link: <a href="{{upload_link}}">{{upload_link}}</a></li>
<li>Failing to provide the required SOA in the attached format before the stipulated date will be considered Accounts Reconciled.</li>
<li>Any outstanding balance prior to {{statement_period_end}} not highlighted in SOA will not be processed for payment in the future.</li>
</ul>
<p>The link above is the only way to return the statement. For any questions or clarification, please contact {{champion_name}} at <a href="mailto:{{champion_email}}">{{champion_email}}</a>, or our Accounts Payable team at <a href="mailto:{{ap_email}}">{{ap_email}}</a>.</p>
<p>Thank you for your prompt attention to this matter. We value our partnership with your company and look forward to your swift response.</p>
<p>Thank you!</p>
<p><strong>Supply Chain and Accounts Payable team</strong><br />
NESR</p>
<hr />
<div dir="rtl" lang="ar">
<h3>تنبيه !</h3>
<h2>طلب كشف حساب</h2>
<p>عزيزي الشريك التجاري</p>
<p>نظرا للتحقق الدوري الذي نقوم به لضمان توافق الحسابات، نحن نقوم بمراجعة حساباتنا وسنكون ممتنين لو تمكنتم من تقديم تقرير كشف حساب محدث للمعاملات بين شركتكم وبيننا.</p>
<p>إننا نحتاج الى هذه المعلومات للتأكد من أن سجلاتنا دقيقة ومحدثة، وللتعامل مع أي تباينات.</p>
<p>يرجى ارفاق التفاصيل التالية في الكشف:</p>
<ul>
<li>جميع الفواتير الغير مدفوعة التي أصدرت لنا</li>
<li>أي ارصدة متبقية</li>
<li>ملاحظات اشعار الإتمان (Credit Note) او التعديل، إن وجد</li>
<li>أي مبلغ غير مفوتر</li>
</ul>
<p><strong>ملاحظات:</strong></p>
<ul>
<li>يجب أن يغطي كشف الحساب الفترة حتى <strong>{{statement_period_end}}</strong> وأن يتم تقديمه في نموذج الاكسل (Excel) المرفق.</li>
<li>يرجى رفع كشف الحساب بحلول <strong>{{reply_by}}</strong> عبر الرابط الخاص بكم: <a href="{{upload_link}}">{{upload_link}}</a></li>
<li>في حال عدم تقديم كشف الحساب المطلوب في التنسيق والمرفقات المذكورة قبل الموعد المحدد، سيتم اعتبار الحسابات مطابقة.</li>
<li>أي رصيد متبقي قبل {{statement_period_end}} ولم يتم ذكره في تقرير الحساب لن يتم معالجته للدفع في المستقبل.</li>
</ul>
<p>الرابط أعلاه هو الطريقة الوحيدة لإرسال كشف الحساب. لأي استفسار أو توضيح، يرجى التواصل مع {{champion_name}} على <a href="mailto:{{champion_email}}">{{champion_email}}</a>، أو مع قسم الحسابات الدائنة على <a href="mailto:{{ap_email}}">{{ap_email}}</a>.</p>
<p>شكرأ لاهتمامكم السريع بهذه المسألة. نحن نقدر شراكتنا مع شركتكم ونتطلع إلى استجابتكم السريعة.</p>
<p>شكراً لكم!</p>
<p><strong>فريق سلسلة التوريد والحسابات الدائنة</strong><br />
شركة نسر</p>
</div>`;

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
  allowedAttributes: {
    a: ['href', 'title'],
    '*': ['dir', 'lang', 'style'],
  },
  // mailto and tel matter here; everything else that can carry script does not.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedStyles: {
    '*': {
      'text-align': [/^left$|^right$|^center$|^justify$/],
      'font-weight': [/^bold$|^normal$|^\d{3}$/],
      'text-decoration': [/^underline$|^line-through$|^none$/],
      color: [/^#[0-9a-fA-F]{3,6}$/],
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
