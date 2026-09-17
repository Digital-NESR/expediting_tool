'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchSnsSuppliers } from '@/app/actions/sns-suppliers';
import type { SupplierOption } from '@/app/actions/sns-suppliers';

/**
 * Supplier chooser for the New Record wizard.
 *
 * Type-to-filter over the approved vendor list rather than two free-text boxes:
 * the SAP ID and name have to agree with each other and with SAP, and typing
 * both by hand is how a record ends up naming one vendor by code and another by
 * name. Picking sets both at once.
 *
 * Results come from the server a page at a time — the list is ~4,400 rows, too
 * many to ship to the browser just to filter locally.
 */
export default function SupplierPicker({
  sapId,
  name,
  onPick,
  onClear,
}: {
  sapId: string;
  name: string;
  onPick: (option: SupplierOption) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SupplierOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const chosen = Boolean(sapId && name);

  /* Debounced so typing a vendor name is one query, not one per keystroke. The
     sequence guard drops a slow earlier response that lands after a later one,
     which would otherwise repopulate the list with stale matches. */
  const seq = useRef(0);
  useEffect(() => {
    if (!open || chosen) return;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      // Inside the timer rather than the effect body: the previous results stay
      // on screen through the debounce window instead of flashing "Searching…"
      // on every keystroke.
      setLoading(true);
      void searchSnsSuppliers(query).then((rows) => {
        if (mine !== seq.current) return;
        setOptions(rows);
        setHighlight(0);
        setLoading(false);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, chosen]);

  // Clicking away closes the list without choosing anything.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = useCallback(
    (option: SupplierOption) => {
      onPick(option);
      setOpen(false);
      setQuery('');
    },
    [onPick],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[highlight]) choose(options[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  if (chosen) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.6 }}>
          SUPPLIER
        </label>
        <div
          style={{
            border: '1px solid #6AAF8E',
            background: '#F5FAF7',
            padding: '9px 10px',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 'bold' }}>{name}</div>
            <div
              style={{ fontFamily: 'Consolas,Menlo,monospace', fontSize: 11.5, color: '#58595B' }}
            >
              SAP {sapId}
            </div>
          </div>
          <button
            onClick={() => {
              onClear();
              setQuery('');
              setOpen(true);
            }}
            className="link-btn"
            style={{ fontSize: 11.5, flex: '0 0 auto' }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 5, position: 'relative' }}
    >
      <label style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.6 }}>
        SUPPLIER
      </label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search by name or SAP ID"
        style={{ border: '1px solid #D1D3D4', padding: '9px 10px', borderRadius: 2 }}
      />
      <span style={{ fontSize: 11, color: '#58595B', lineHeight: 1.45 }}>
        From the approved vendor list. Choosing sets the SAP ID and name together.
      </span>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 20,
            background: '#fff',
            border: '1px solid #D1D3D4',
            maxHeight: 280,
            overflowY: 'auto',
            boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
          }}
        >
          {loading && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#8A8C8E' }}>Searching…</div>
          )}
          {!loading && options.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#8A8C8E' }}>
              {query.trim()
                ? 'No approved supplier matches that.'
                : 'Start typing a name or SAP ID.'}
            </div>
          )}
          {!loading &&
            options.map((o, i) => (
              <div
                key={o.sapId}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(o)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: i === highlight ? '#EDF5F0' : '#fff',
                  borderBottom: '1px solid #F2F3F3',
                }}
              >
                <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 'bold' }}>{o.name}</span>
                  {o.blocked && (
                    <span
                      style={{
                        background: '#F8DCDC',
                        color: '#9B1C1C',
                        fontSize: 10,
                        fontWeight: 'bold',
                        padding: '1px 6px',
                        borderRadius: 8,
                      }}
                    >
                      blocked in SAP
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: 'Consolas,Menlo,monospace',
                    fontSize: 11.5,
                    color: '#58595B',
                  }}
                >
                  {o.sapId}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
