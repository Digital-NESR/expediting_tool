import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllTiteCountries } from '@/app/actions/tite';
import NewShipmentClient from './NewShipmentClient';

export const metadata: Metadata = { title: 'Add Shipment — TI-TE | SC Agents' };

const TITE_FALLBACK_COUNTRIES = [
  'Saudi Arabia (KSA)',
  'United Arab Emirates (UAE)',
  'Qatar',
  'Kuwait',
  'Oman',
  'Bahrain',
  'Egypt',
  'Algeria',
  'Iraq',
  'Libya',
  'Chad',
  'Congo',
  'Other',
];

export default async function NewShipmentPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());

  let countryOptions: string[];
  if (isAdmin) {
    const dbCountries = await getAllTiteCountries();
    const merged = [...new Set([...TITE_FALLBACK_COUNTRIES, ...dbCountries])].sort();
    countryOptions = merged;
  } else {
    countryOptions = session?.user?.toolAccess?.tite?.approvedCountries ?? [];
  }

  return <NewShipmentClient countryOptions={countryOptions} isAdmin={isAdmin} />;
}
