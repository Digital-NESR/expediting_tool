import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/require-access';
import { getIcsaActor } from '@/lib/icsa/access';
import { loadBankForAdmin } from '@/lib/icsa/catalog';
import { listChampions, listPendingExtensions } from '@/lib/icsa/queries';
import { mailConfigured } from '@/lib/icsa/mail';
import { Banner, PageHeader } from '../components/ui';
import { ChampionsPanel, ExtensionsPanel } from './AdminClient';
import QuestionBankPanel from './QuestionBankPanel';
import { icsaSignInPath } from '@/lib/icsa/demo';

/**
 * The administrator settings live in the SC Agents admin panel (/admin/self-assessment). This
 * page sends platform admins there, and shows the same panels to the people who cannot open
 * /admin: admins named only in ICSA_ADMIN_EMAILS, and the demo admins.
 */
export default async function IcsaAdminPage() {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  if (!actor.isAdmin) redirect('/icsa');
  if (!actor.isDemo && (await currentActor())?.isPlatformAdmin) {
    redirect('/admin/self-assessment');
  }
  const [champions, extensions, bank] = await Promise.all([
    listChampions(),
    listPendingExtensions(),
    loadBankForAdmin(),
  ]);

  return (
    <>
      <PageHeader eyebrow="Administrator" title="Administration">
        Edit the questions, appoint champions and decide extension requests. Cycles are opened from
        the Cycles page.
      </PageHeader>
      {!mailConfigured() && (
        <div className="mb-4">
          <Banner tone="warn">
            Email is not configured (N8N_ICSA_WEBHOOK_URL), so requests are recorded but not emailed
            and reminders cannot be sent. Respondents still see their forms when they open the
            Self-Assessment.
          </Banner>
        </div>
      )}
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
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
      <QuestionBankPanel bank={bank} />
    </>
  );
}
