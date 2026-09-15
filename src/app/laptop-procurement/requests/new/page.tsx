import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLaptopActor } from '@/app/actions/laptopProcurement';
import { getEmployeeDirectoryDefaults } from '@/app/actions/employeeDirectory';
import { getProcureGuardUser } from '@/lib/auth';
import { departmentsSeedFor, getCostCenterFormData } from '@/lib/laptopCostCenters.server';
import LaptopRequestFormClient from './LaptopRequestFormClient';

export const metadata: Metadata = { title: 'NESR | New Request - Laptop Procurement' };

export default async function NewLaptopRequestPage() {
  const user = await getProcureGuardUser();
  const actor = await getLaptopActor();

  // Being signed in is the whole gate: every access view, Viewer included, reaches the
  // operational pages today. That is the current product behaviour rather than a gap here —
  // a Viewer is held back from acting by its own permissions (it has no canCreateRequests,
  // which is what the form and createLaptopRequest both check), not by routing.
  if (!actor) {
    redirect('/laptop-procurement/analytics');
  }

  const directoryDefaults = await getEmployeeDirectoryDefaults(user?.email ?? '');

  /* The company list and the one company's departments the form opens on. Both read the same
     cached snapshot of the mapping, so this is one database round trip, not two. */
  const [costCenterData, initialDepartments] = await Promise.all([
    getCostCenterFormData(),
    departmentsSeedFor(directoryDefaults?.companyCode),
  ]);

  return (
    <LaptopRequestFormClient
      requesterName={user?.name ?? user?.email ?? ''}
      requesterEmail={user?.email ?? ''}
      directoryDefaults={directoryDefaults}
      costCenterData={costCenterData}
      initialDepartments={initialDepartments}
      accessView={actor.effectiveAccessView}
    />
  );
}
