'use client';

/**
 * Lightweight, client-only progress tracking for the AI Learning series.
 *
 * There's no database behind this section — completion is a nice-to-have, not
 * a system of record — so we keep per-module quiz results in localStorage.
 */

const STORAGE_KEY = 'nesr.ai-learning.progress.v1';

export interface ModuleResult {
  /** number of questions answered correctly */
  score: number;
  /** total questions in the quiz */
  total: number;
  /** ISO timestamp of the most recent completion */
  completedAt: string;
}

export type ProgressMap = Record<string, ModuleResult>;

export function readProgress(): ProgressMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

export function saveModuleResult(moduleId: string, result: ModuleResult): ProgressMap {
  const current = readProgress();
  // keep the best score if the module was retaken
  const prev = current[moduleId];
  const best =
    prev && prev.score >= result.score
      ? { ...prev, completedAt: result.completedAt }
      : result;
  const next = { ...current, [moduleId]: best };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — progress is best-effort */
  }
  return next;
}
