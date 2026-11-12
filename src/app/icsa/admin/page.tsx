import { redirect } from 'next/navigation';
import { getIcsaActor } from '@/lib/icsa/access';
import { listChampions, listPendingExtensions } from '@/lib/icsa/queries';
import { mailConfigured } from '@/lib/icsa/mail';
import { Banner, PageHeader } from '../components/ui';
import { ChampionsPanel, ExtensionsPanel } from './AdminClient';
import { icsaSignInPath } from '@/lib/icsa/demo';

export default async function IcsaAdminPage() {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  if (!actor.isAdmin) redirect('/icsa');
  const [champions, extensions] = await Promise.all([listChampions(), listPendingExtensions()]);

  return (
    <>
      <PageHeader eyebrow="Administrator" title="Administration">
        Appoint champions and decide extension requests. Cycles are opened from the Cycles page.
      </PageHeader>
      {!mailConfigured() && (
        <div className="mb-4">
          <Banner tone="warn">
            Email is not configured (N8N_ICSA_WEBHOOK_URL), so requests are recorded but not emailed
            and reminders cannot be sent. Respondents still see their forms when they open ICSA.
          </Banner>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <ChampionsPanel champions={champions} />
        <ExtensionsPanel
          requests={extensions.map((r) => ({
            id: r.id,
            country: r.country,
            cycleLabel: r.cycleLabel,
            requestedBy: r.requestedBy,
            requestedDeadline: r.requestedDeadline,
            currentDeadline: r.currentDeadline,
            reason: r.reason,
            requestedAt: r.requestedAt,
          }))}
        />
      </div>
    </>
  );
}
