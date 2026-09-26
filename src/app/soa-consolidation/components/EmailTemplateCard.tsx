'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getSoaTemplate,
  previewSoaTemplate,
  resetSoaTemplate,
  saveSoaTemplate,
  type TemplateView,
} from '@/app/actions/soa/templates';
import RichTextEditor from './RichTextEditor';

/**
 * Step one of outreach: the letter itself.
 *
 * The wording is the champion's responsibility — it carries their name, their AP mailbox and the
 * date after which a silent vendor is treated as reconciled — so it is shown in full and editable
 * rather than hidden inside the automation. The preview renders against the country's largest
 * vendor with the real cycle dates, because a placeholder that fails to resolve is only obvious
 * when everything around it is real.
 */

interface Props {
  countryId: string;
  canEdit: boolean;
  onNext: () => void;
}

export default function EmailTemplateCard({ countryId, canEdit, onNext }: Props) {
  const [view, setView] = useState<TemplateView | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const res = await getSoaTemplate(countryId);
    if (res.success && res.data) {
      setView(res.data);
      setSubject(res.data.subject);
      setBody(res.data.bodyHtml);
      setPreview({ subject: res.data.previewSubject, html: res.data.previewHtml });
      setDirty(false);
    } else {
      setNote(res.error ?? 'Could not load the letter.');
    }
    setBusy(false);
  }, [countryId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The preview is refreshed on demand rather than on every keystroke: it is a server round trip
     per refresh, and a letter is edited in paragraphs, not characters. */
  async function refreshPreview() {
    setBusy(true);
    const res = await previewSoaTemplate({ countryId, subject, bodyHtml: body });
    if (res.success && res.data) {
      setPreview({ subject: res.data.subject, html: res.data.html });
      setMode('preview');
    } else setNote(res.error ?? 'Could not render the preview.');
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    const res = await saveSoaTemplate({ countryId, subject, bodyHtml: body });
    setBusy(false);
    if (!res.success) return setNote(res.error ?? 'Could not save.');
    setNote('Letter saved for this country.');
    await load();
  }

  async function reset() {
    if (!window.confirm('Discard this country’s wording and go back to the standard letter?')) return;
    setBusy(true);
    const res = await resetSoaTemplate(countryId);
    setBusy(false);
    if (!res.success) return setNote(res.error ?? 'Could not reset.');
    setNote('Reverted to the standard letter.');
    await load();
  }

  const sourceLabel =
    view?.source === 'country'
      ? `Edited for this country${view.updatedBy ? ` by ${view.updatedBy}` : ''}`
      : view?.source === 'global'
        ? 'Using the standard letter set in /admin'
        : 'Using the standard letter';

  return (
    <div className="bg-white rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.07)] mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-b-[#F0F0F0] px-4 py-3">
        <div>
          <div className="text-[13px] font-bold text-sns-ink">Statement request letter</div>
          <div className="text-[11px] text-sns-grey mt-0.5">{sourceLabel}</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
            disabled={busy || !canEdit}
            className="bg-white text-sns-ink border border-sns-line px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
          >
            {mode === 'edit' ? 'Preview' : 'Edit letter'}
          </button>
          {mode === 'edit' && (
            <>
              <button
                type="button"
                onClick={refreshPreview}
                disabled={busy}
                className="bg-white text-sns-ink border border-sns-line px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
              >
                Refresh preview
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || !dirty}
                className="bg-sns-green text-white border-none px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
              >
                Save letter
              </button>
            </>
          )}
          {view?.source === 'country' && canEdit && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="bg-white text-[#B71C1C] border border-sns-line px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {view?.apEmailMissing && (
        <div className="mx-4 mt-3 rounded-md bg-[#FFF4E5] border border-[#FFD8A8] px-3 py-2 text-[11.5px] text-[#8A4B00]">
          <strong>No AP mailbox for this country.</strong> The letter tells the vendor where to
          reply, and there is nothing to put there. Set it in /admin before sending.
        </div>
      )}
      {!!view?.unknown.length && (
        <div className="mx-4 mt-3 rounded-md bg-[#FDECEA] border border-[#F5C6C2] px-3 py-2 text-[11.5px] text-[#B71C1C]">
          Unknown field{view.unknown.length > 1 ? 's' : ''}:{' '}
          <span className="font-[family-name:monospace]">
            {view.unknown.map((t) => `{{${t}}}`).join(', ')}
          </span>{' '}
          — these will go out to the vendor exactly as written.
        </div>
      )}
      {note && (
        <div className="mx-4 mt-3 rounded-md bg-[#F1F6F2] border border-[#CFE3D6] px-3 py-2 text-[11.5px] text-sns-ink">
          {note}
        </div>
      )}

      <div className="p-4">
        <label className="block text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey mb-1">
          Subject
        </label>
        {mode === 'edit' ? (
          <input
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setDirty(true);
            }}
            disabled={!canEdit}
            className="w-full border border-sns-line rounded-md px-3 py-2 text-[12.5px] mb-3"
          />
        ) : (
          <div className="mb-3 text-[12.5px] font-bold text-sns-ink">
            {preview?.subject ?? subject}
          </div>
        )}

        {mode === 'edit' ? (
          <RichTextEditor
            value={body}
            onChange={(html) => {
              setBody(html);
              setDirty(true);
            }}
            disabled={!canEdit}
            placeholders={view?.placeholders ?? []}
          />
        ) : (
          <div
            className="border border-sns-line rounded-lg px-4 py-3 max-h-[460px] overflow-y-auto text-[13px] leading-[1.6] bg-[#FCFCFC] [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-1.5 [&_a]:text-sns-green [&_a]:underline [&_hr]:my-3 [&_hr]:border-sns-line"
            /* Server-sanitised on the way into the database and rendered here only after that;
               see sanitizeTemplateHtml. */
            dangerouslySetInnerHTML={{ __html: preview?.html ?? '' }}
          />
        )}

        <div className="flex justify-between items-center mt-4">
          <div className="text-[11px] text-sns-grey">
            {mode === 'preview'
              ? 'Shown with this country’s largest vendor and the real cycle dates.'
              : 'Use “Insert field” for anything that changes per vendor.'}
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={dirty}
            title={dirty ? 'Save or discard your edits first' : undefined}
            className="bg-sns-green text-white border-none px-4 py-[9px] rounded-[7px] text-[13px] font-bold disabled:opacity-50"
          >
            Next: recipients →
          </button>
        </div>
      </div>
    </div>
  );
}
