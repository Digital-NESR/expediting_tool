'use client';

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * "Are you sure" for the handful of clicks that cannot be taken back.
 *
 * Sending is the reason this exists. A champion pressing "Send the request to 61 vendors" puts 61
 * letters into 61 suppliers' inboxes, and there is no version of this tool that can retrieve them.
 * The same is true of a reminder going out a day after the first request by mistake, and of taking
 * a vendor out of a cycle along with every address somebody tracked down for it.
 *
 * Deliberately NOT on every mutation. A confirmation on a reversible act teaches people to click
 * through confirmations, which costs exactly the protection the irreversible ones need. Editing an
 * address, ticking a scope box, opening a screen: none of those ask.
 *
 * `window.confirm` would have been one line. It blocks the whole tab, it cannot say "61 vendors"
 * in bold above the reason, it cannot colour a destructive action differently from an ordinary
 * one, and on a second dialog some browsers offer to suppress it entirely, which would silently
 * turn the guard off.
 */

export interface ConfirmRequest {
  title: string;
  /** What is about to happen, in the words of the person it happens to. */
  body: React.ReactNode;
  confirmLabel: string;
  /** `danger` for anything that destroys or dispatches; `normal` for the merely significant. */
  tone?: 'danger' | 'normal';
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  // Held in a ref as well, so an unmount or a second ask cannot leave the first caller awaiting a
  // promise that will never settle.
  const openRef = useRef<Pending | null>(null);

  const settle = useCallback((ok: boolean) => {
    openRef.current?.resolve(ok);
    openRef.current = null;
    setPending(null);
  }, []);

  const ask = useCallback(
    (request: ConfirmRequest): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        openRef.current?.resolve(false);
        const next = { ...request, resolve };
        openRef.current = next;
        setPending(next);
      }),
    [],
  );

  const danger = pending?.tone !== 'normal';

  const dialog =
    pending && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={pending.title}
            onClick={(e) => {
              // Clicking the backdrop cancels. It never confirms: the safe outcome is the one an
              // accidental click should reach.
              if (e.target === e.currentTarget) settle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') settle(false);
            }}
          >
            <div className="w-[420px] max-w-full overflow-hidden rounded-xl bg-white shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
              <div className={`px-5 py-3.5 ${danger ? 'bg-[#B71C1C]' : 'bg-sns-green'}`}>
                <div className="text-[13.5px] font-bold text-white">{pending.title}</div>
              </div>
              <div className="px-5 py-4 text-[12.5px] leading-[1.5] text-sns-ink">
                {pending.body}
              </div>
              <div className="flex gap-2 px-5 pb-5">
                <button
                  type="button"
                  onClick={() => settle(false)}
                  className="flex-1 rounded-[7px] border-none bg-[#F5F5F5] p-2.5 text-[12px] font-bold text-sns-grey"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => settle(true)}
                  className={`flex-[2] rounded-[7px] border-none p-2.5 text-[12px] font-bold text-white ${
                    danger ? 'bg-[#B71C1C]' : 'bg-sns-green'
                  }`}
                >
                  {pending.confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return { ask, dialog };
}
