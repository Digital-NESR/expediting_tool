'use client';

import { createPortal } from 'react-dom';
import type { ScreenProps } from '../types';
import { TOAST_FILL } from './tones';

export default function ToastStack({ vm }: ScreenProps) {
  if (!vm.hasToasts || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[200]">
      {vm.toasts.map((t) => (
        <div
          key={t.id}
          className={`${TOAST_FILL[t.type]} text-white rounded-lg px-4 py-3 min-w-[240px] shadow-[0_4px_12px_rgba(0,0,0,0.2)] animate-[fadeIn_0.2s_ease]`}
        >
          <div className="text-[12px] font-bold mb-0.5">{t.title}</div>
          <div className="text-[11px] opacity-90">{t.msg}</div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
