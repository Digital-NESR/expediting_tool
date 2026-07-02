'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, Spinner } from './CatalogManagerUI';
import { decideCatalogEntry, bulkDecideEntries } from '@/app/actions/catalog-manager';
import type { CatalogEntry } from '@/types/catalog-manager';
import { fmtMoney, fmtUsd } from '@/lib/catalog-manager-utils';

const CONFETTI_COLORS = ['#307c4c', '#6aaf8e', '#f59e0b', '#0ea5e9', '#334155', '#f43f5e'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  shape: number;
  life: number;
  ttl: number;
}

function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return undefined;
    const context = canvasElement.getContext('2d');
    if (!context) return undefined;
    const canvas = canvasElement;
    const ctx = context;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pieces: ConfettiPiece[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let particleScale = 1;
    let gravity = 0.13;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      particleScale = clamp(Math.hypot(width, height) / 1450, 0.82, 1.75);
      gravity = 0.11 * particleScale;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function emit(originX: number, originY: number, count: number, angle: number, spread: number, power: number) {
      for (let i = 0; i < count; i++) {
        const drift = (Math.random() - 0.5) * spread;
        const speed = power * (0.7 + Math.random() * 0.65);
        pieces.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle + drift) * speed,
          vy: Math.sin(angle + drift) * speed,
          size: (6 + Math.random() * 11) * particleScale,
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * (0.24 + particleScale * 0.12),
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          shape: Math.floor(Math.random() * 3),
          life: 0,
          ttl: Math.round(82 + Math.random() * 40 + particleScale * 18),
        });
      }
    }

    function drawPiece(piece: ConfettiPiece, alpha: number) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rotation);
      ctx.fillStyle = piece.color;
      if (piece.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, piece.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (piece.shape === 2) {
        ctx.fillRect(-piece.size * 0.22, -piece.size, piece.size * 0.44, piece.size * 2.2);
      } else {
        ctx.fillRect(-piece.size * 0.65, -piece.size * 0.35, piece.size * 1.3, piece.size * 0.7);
      }
      ctx.restore();
    }

    function frame() {
      ctx.clearRect(0, 0, width, height);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const piece = pieces[i];
        piece.life += 1;
        piece.vy += gravity;
        piece.vx *= 0.992;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.spin;
        const alpha = Math.max(0, 1 - piece.life / piece.ttl);
        drawPiece(piece, alpha);
        if (piece.life >= piece.ttl || piece.y > height + 40) pieces.splice(i, 1);
      }
      if (pieces.length > 0) raf = window.requestAnimationFrame(frame);
    }

    resize();
    const areaScale = clamp((width * height) / (1440 * 900), 0.58, 2.25);
    const edgeInset = clamp(width * 0.045, 18, 92);
    const launchY = height - clamp(height * 0.12, 64, 160);
    const diagonalPower = clamp(Math.hypot(width, height) / 118, 10.5, 23);
    const sideCount = Math.round(88 * areaScale);
    const centerCount = Math.round(58 * areaScale);

    if (reduceMotion) {
      emit(width * 0.5, launchY, Math.max(20, Math.round(28 * areaScale)), -Math.PI / 2, 1.1, diagonalPower * 0.52);
    } else {
      emit(edgeInset, launchY, sideCount, -Math.PI * 0.36, 0.92, diagonalPower);
      emit(width - edgeInset, launchY, sideCount, Math.PI + Math.PI * 0.36, 0.92, diagonalPower);
      emit(width * 0.5, launchY + 18 * particleScale, centerCount, -Math.PI / 2, 1.36, diagonalPower * 0.78);
    }
    raf = window.requestAnimationFrame(frame);
    window.addEventListener('resize', resize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[100]" aria-hidden="true" />
  );
}

export default function DecisionDialog({
  open, decision, entry, bulk, onClose, onDone,
}: {
  open: boolean;
  decision: 'approve' | 'reject';
  entry: CatalogEntry;
  bulk?: { supplier: string; entries: CatalogEntry[] };
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'reject' | 'revise'>('reject');
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  if (!open) return null;
  const approving = decision === 'approve';
  const isBulk = !!bulk && bulk.entries.length > 1;
  const bulkTotalUsd = bulk ? bulk.entries.reduce((s, e) => s + e.usd_equivalent, 0) : 0;

  async function confirm() {
    if (!comment.trim()) { setErr('A comment is required to record this decision.'); return; }
    setBusy(true);
    try {
      if (bulk) {
        await bulkDecideEntries(bulk.entries.map((e) => e.id), comment.trim());
      } else {
        await decideCatalogEntry(entry.id, approving ? 'approve' : mode, comment.trim());
      }
      if (approving) {
        setShowConfetti(true);
        window.setTimeout(onDone, 1250);
      } else {
        onDone();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[8vh]">
      {showConfetti && <ConfettiBurst />}
      <button aria-label="Close" className="cm-fade-in absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="cm-scale-in relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 pb-4 pt-5">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-4 ${approving ? 'bg-[#307c4c]/10 text-[#307c4c] ring-[#307c4c]/5' : 'bg-red-50 text-red-600 ring-red-500/5'}`}>
            <Icon name={approving ? 'approve' : 'x'} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">{isBulk ? `Approve ${bulk!.entries.length} entries` : approving ? 'Approve catalog entry' : 'Reject or request revision'}</h2>
            <p className="truncate text-[12.5px] text-slate-500">{isBulk ? bulk!.supplier : `${entry.code} · ${entry.supplier_name}`}</p>
          </div>
        </div>

        <div className="px-5 py-4">
          {isBulk ? (
            <div className="mb-3 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
              {bulk!.entries.map((e, i) => (
                <div key={e.id} className={`flex items-center gap-2 px-3 py-2 text-[12.5px] ${i ? 'border-t border-slate-100' : ''}`}>
                  <span className="font-mono text-[11px] text-slate-400">{e.code}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">{e.commodity || e.item_name}</span>
                  <span className="shrink-0 font-mono font-semibold text-slate-900">{fmtMoney(e.unit_price, e.currency_code)} <span className="font-sans text-[11px] font-normal text-slate-400">{e.currency_code}</span></span>
                </div>
              ))}
            </div>
          ) : (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-slate-900">{entry.commodity || entry.item_name}</div>
              <div className="text-[12px] text-slate-400">{entry.category_name} · {entry.country_flag} {entry.country_name}</div>
            </div>
            <div className="ml-3 shrink-0 text-right">
              <div className="font-mono text-base font-bold text-slate-900">{fmtMoney(entry.unit_price, entry.currency_code)}</div>
              <div className="text-[11px] text-slate-400">{entry.currency_code} / {entry.uom_name} · ≈${fmtUsd(entry.usd_equivalent)}</div>
            </div>
          </div>
          )}

          {isBulk && (
            <div className="mb-3 flex items-center justify-between text-[12.5px] text-slate-500">
              <span>{bulk!.entries.length} lines · combined</span>
              <span className="font-mono font-bold text-slate-900">≈ USD {fmtUsd(bulkTotalUsd)}</span>
            </div>
          )}

          {!approving && !isBulk && (
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {([['reject', 'Reject', 'x'], ['revise', 'Request revision', 'revise']] as const).map(([v, label, ic]) => (
                <button key={v} onClick={() => setMode(v)} className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold ${mode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
                  <Icon name={ic} className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-slate-600">{approving ? 'Approval comment' : 'Reason (shared with submitter)'}<span className="ml-0.5 text-red-500">*</span></span>
            <textarea
              value={comment}
              onChange={(e) => { setComment(e.target.value); setErr(null); }}
              placeholder={isBulk ? 'e.g. Rate card reviewed against quotation — all lines within benchmark.' : approving ? 'e.g. Within benchmark for the region — approved.' : 'Explain what needs to change…'}
              className={`min-h-[88px] w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#307c4c]/20 ${err ? 'border-red-300' : 'border-slate-300 focus:border-[#307c4c]'}`}
            />
            {err && <span className="text-[11.5px] font-medium text-red-600">{err}</span>}
          </label>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50">Cancel</button>
          <button
            onClick={confirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${approving ? 'bg-[#307c4c] shadow-[#307c4c]/25 hover:bg-[#2b6f44]' : 'bg-red-600 shadow-red-600/20 hover:bg-red-700'}`}
          >
            {busy
              ? <Spinner className="h-4 w-4" />
              : <Icon name={approving ? 'check' : mode === 'revise' ? 'revise' : 'x'} className="h-4 w-4" />}
            {isBulk ? `Approve all ${bulk!.entries.length}` : approving ? 'Approve & activate' : mode === 'revise' ? 'Send back for revision' : 'Reject entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
