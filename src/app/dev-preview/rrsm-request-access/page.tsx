/*
 * The RRSM request-access screen, for development only. Without a session the country list
 * comes back empty and the button does nothing. Dev-only: notFound() in production.
 */
import { notFound } from 'next/navigation';
import RrsmRequestAccess from '@/app/rrsm/components/RrsmRequestAccess';

export const dynamic = 'force-dynamic';

export default async function RrsmRequestAccessPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <RrsmRequestAccess />;
}
