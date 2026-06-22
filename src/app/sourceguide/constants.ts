/* SourceGuide brand + shared constants (no React, safe to import anywhere) */

export const SG_BRAND = '#2A7E4F';
export const SG_BRAND_DARK = '#1f5d3a';
export const SG_BRAND_SOFT = '#eaf4ef';
export const VIEW_ONLY = 'All Countries - View Only';

/** deterministic avatar tone for a supplier name */
export function supplierTone(name: string): string {
  const tones = ['#2A7E4F', '#1F7A6B', '#3E6FB0', '#8A6D2F', '#6B5BA8'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return tones[Math.abs(h) % tones.length];
}

export function initials(name: string): string {
  return (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
