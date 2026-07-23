import type { Metadata } from 'next';
import { getProcureGuardActor } from '@/app/actions/procureGuard';
import ProcureGuardHelpClient from './ProcureGuardHelpClient';

export const metadata: Metadata = { title: 'NESR | Help & Training - ProcureGuard' };

export default async function ProcureGuardHelpPage() {
  const actor = await getProcureGuardActor();
  return <ProcureGuardHelpClient accessView={actor?.permissions.accessView ?? 'requester'} />;
}
