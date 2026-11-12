import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getIcsaActor } from '@/lib/icsa/access';
import { getAssessment, listEvidence } from '@/lib/icsa/queries';
import { EDITABLE_STATUSES } from '@/lib/icsa/model';
import AssessmentForm from './AssessmentForm';
import { icsaSignInPath } from '@/lib/icsa/demo';

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  const { id } = await params;
  const found = await getAssessment(actor, Number(id) || 0);
  if (!found) notFound();
  const { assessment, access } = found;
  const evidence = await listEvidence(assessment.id);

  const isRespondent = access.includes('respondent');
  const isManager = access.includes('manager');
  const canEdit =
    isRespondent &&
    assessment.enrollmentStatus === 'open' &&
    EDITABLE_STATUSES.includes(assessment.status);

  return (
    <>
      <div className="mb-4 text-sm">
        {isManager && !isRespondent ? (
          <Link
            className="text-[#307c4c] hover:underline"
            href={`/icsa/enrollments/${assessment.enrollmentId}`}
          >
            ← {assessment.country} · {assessment.cycleLabel}
          </Link>
        ) : (
          <Link className="text-[#307c4c] hover:underline" href="/icsa">
            ← My assessments
          </Link>
        )}
      </div>
      <AssessmentForm
        assessment={assessment}
        evidence={evidence}
        canEdit={canEdit}
        canReview={isManager}
      />
    </>
  );
}
