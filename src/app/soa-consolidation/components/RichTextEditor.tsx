'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A small rich-text editor for the statement-request letter.
 *
 * Deliberately `contentEditable` with a fixed toolbar rather than a third-party editor: the
 * platform runs on 27 dependencies, and a full editor framework brings twenty transitive packages
 * to provide bold, bullets and a direction toggle. `document.execCommand` is formally deprecated
 * and has no replacement; every browser still implements it, and the alternative here is a much
 * larger dependency for a letter that is edited a handful of times a quarter.
 *
 * Whatever this produces is sanitised on the server before it is stored — see
 * `sanitizeTemplateHtml`. Nothing here is a security boundary.
 */

interface Props {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  /** Tokens offered in the "insert field" menu. */
  placeholders: { token: string; label: string }[];
}

/* Plain data, declared once outside the component: an array of closures rebuilt on every render
   reads `ref.current` during render, which React's lint rule rightly objects to. The button's
   onClick supplies the ref access instead, which is where it belongs. */
const COMMANDS: { icon: string; title: string; command: string }[] = [
  { icon: 'B', title: 'Bold', command: 'bold' },
  { icon: 'I', title: 'Italic', command: 'italic' },
  { icon: 'U', title: 'Underline', command: 'underline' },
  { icon: '• —', title: 'Bulleted list', command: 'insertUnorderedList' },
  { icon: '1.', title: 'Numbered list', command: 'insertOrderedList' },
];

export default function RichTextEditor({ value, onChange, disabled, placeholders }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [showFields, setShowFields] = useState(false);
  /* What we last handed the DOM. A controlled contentEditable that is re-assigned on every
     keystroke puts the caret back at the start, so the node is only written when the incoming
     value is something other than what the user just typed. */
  const emitted = useRef(value);

  useEffect(() => {
    if (ref.current && value !== emitted.current) {
      ref.current.innerHTML = value;
      emitted.current = value;
    }
  }, [value]);

  const push = useCallback(() => {
    const html = ref.current?.innerHTML ?? '';
    emitted.current = html;
    onChange(html);
  }, [onChange]);

  const exec = useCallback(
    (command: string, arg?: string) => {
      if (disabled) return;
      ref.current?.focus();
      document.execCommand(command, false, arg);
      push();
    },
    [disabled, push],
  );

  const insert = useCallback(
    (token: string) => {
      exec('insertText', `{{${token}}}`);
      setShowFields(false);
    },
    [exec],
  );

  return (
    <div className="border border-sns-line rounded-lg overflow-hidden bg-white">
      <div className="flex items-center gap-1 flex-wrap border-b border-b-sns-line bg-[#FAFAFA] px-2 py-1.5">
        {COMMANDS.map((c) => (
          <button
            key={c.title}
            type="button"
            title={c.title}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(c.command)}
            className="min-w-[28px] h-[26px] px-1.5 rounded border border-transparent hover:border-sns-line hover:bg-white text-[12px] font-bold text-sns-ink disabled:opacity-40"
          >
            {c.icon}
          </button>
        ))}
        <button
          type="button"
          title="Insert link"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt('Link address (https://… or mailto:…)');
            if (url) exec('createLink', url);
          }}
          className="min-w-[28px] h-[26px] px-1.5 rounded border border-transparent hover:border-sns-line hover:bg-white text-[12px] font-bold text-sns-ink disabled:opacity-40"
        >
          Link
        </button>

        <span className="w-px h-4 bg-sns-line mx-1" />

        {/* Direction matters here: the approved letter carries an Arabic half that has to read
            right to left, and a champion editing it needs to be able to restore that. */}
        <button
          type="button"
          title="Make this paragraph right-to-left"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const sel = window.getSelection();
            const node = sel?.anchorNode;
            const el = (node?.nodeType === 1 ? node : node?.parentElement) as HTMLElement | null;
            const block = el?.closest('p,div,li,h1,h2,h3,h4');
            if (block) {
              block.setAttribute('dir', block.getAttribute('dir') === 'rtl' ? 'ltr' : 'rtl');
              push();
            }
          }}
          className="h-[26px] px-2 rounded border border-transparent hover:border-sns-line hover:bg-white text-[11px] font-bold text-sns-ink disabled:opacity-40"
        >
          عربي ⇄
        </button>

        <div className="relative ml-auto">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowFields((s) => !s)}
            className="h-[26px] px-2.5 rounded bg-white border border-sns-line text-[11px] font-bold text-sns-ink disabled:opacity-40"
          >
            Insert field ▾
          </button>
          {showFields && (
            <div className="absolute right-0 top-[30px] z-20 w-[260px] max-h-[280px] overflow-y-auto bg-white border border-sns-line rounded-lg shadow-lg py-1">
              {placeholders.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => insert(p.token)}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#F5F7F5] text-[12px]"
                >
                  <div className="font-bold text-sns-ink">{p.label}</div>
                  <div className="text-[10.5px] text-sns-grey font-[family-name:monospace]">
                    {`{{${p.token}}}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={push}
        onBlur={push}
        role="textbox"
        aria-multiline="true"
        aria-label="Statement request letter"
        className="min-h-[360px] max-h-[560px] overflow-y-auto px-4 py-3 text-[13px] leading-[1.6] outline-none [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_a]:text-sns-green [&_a]:underline [&_hr]:my-3 [&_hr]:border-sns-line"
      />
    </div>
  );
}
