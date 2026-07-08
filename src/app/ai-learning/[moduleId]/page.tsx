import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findModule, nextModule } from '../content';
import ModuleClient from './ModuleClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}): Promise<Metadata> {
  const { moduleId } = await params;
  const found = findModule(moduleId);
  return { title: found ? `${found.module.title} | AI Learning` : 'AI Learning' };
}

export const dynamic = 'force-dynamic';

export default async function AiLearningModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  const found = findModule(moduleId);
  if (!found) notFound();

  const next = nextModule(moduleId);

  return (
    <ModuleClient
      module={found.module}
      track={found.track}
      next={
        next
          ? { id: next.module.id, title: next.module.title, trackTitle: next.track.title }
          : null
      }
    />
  );
}
