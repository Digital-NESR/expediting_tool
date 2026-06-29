// Shared delegation types + constants. Plain module (no 'use server') so it can be
// imported by both server actions and client components.

import type { QueryResultRow } from 'pg';

export type DelegationAppId = 'procureguard' | 'laptop' | 'catalog' | 'tite';
export type DelegationApp = 'all' | DelegationAppId;

export interface DelegationAppMeta {
  id: DelegationAppId;
  label: string;
  route: string;
  color: string;
  tasks: string;
}

// Apps that actually have delegatable approval tasks (PO Expediting has none).
export const DELEGATION_APPS: DelegationAppMeta[] = [
  { id: 'procureguard', label: 'ProcureGuard', route: '/procure-guard', color: '#1f7a4d', tasks: 'Adhoc & advance payment approvals' },
  { id: 'laptop', label: 'Laptop Procurement', route: '/laptop-procurement', color: '#307c4c', tasks: 'Device request approvals' },
  { id: 'catalog', label: 'Catalog Repo', route: '/catalog-manager', color: '#307c4c', tasks: 'Catalog rate approvals' },
  { id: 'tite', label: 'TI-TE', route: '/ti-te', color: '#006B0C', tasks: 'Access-request approvals' },
];

export function delegationAppLabel(app: DelegationApp): string {
  if (app === 'all') return 'All apps';
  return DELEGATION_APPS.find((a) => a.id === app)?.label ?? app;
}

export interface DelegationRow extends QueryResultRow {
  id: number;
  delegator_email: string;
  delegator_name: string | null;
  delegate_email: string;
  delegate_name: string | null;
  app: DelegationApp;
  starts_at: string;
  ends_at: string;
  note: string | null;
  status: 'active' | 'revoked';
  created_at: string;
  created_by: string | null;
  revoked_at: string | null;
}

export interface Delegation {
  id: number;
  delegatorEmail: string;
  delegatorName: string | null;
  delegateEmail: string;
  delegateName: string | null;
  app: DelegationApp;
  startsAt: string;
  endsAt: string;
  note: string | null;
  status: 'active' | 'revoked';
  /** Derived: status active AND now within [starts_at, ends_at]. */
  isLive: boolean;
  isUpcoming: boolean;
  isExpired: boolean;
}

export interface DelegateCandidate {
  email: string;
  name: string;
  source: string;
}

export interface DelegationActionResult {
  success: boolean;
  error?: string;
}
