'use client';

import { createPortal } from 'react-dom';
import type { ScreenProps } from '../types';

export default function ToastStack({ vm }: ScreenProps) {
  if (!vm.hasToasts || typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 200,
      }}
    >
      {vm.toasts.map((t) => (
        <div key={t.id} style={t.toastStyle}>
          <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 2 }}>{t.title}</div>
          <div style={{ fontSize: 11, opacity: 0.9 }}>{t.msg}</div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
