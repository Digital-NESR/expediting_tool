import type { Metadata } from 'next';
import { TRACKS, TOTAL_MODULES } from './content';
import AiLearningHomeClient from './AiLearningHomeClient';

export const metadata: Metadata = { title: 'AI Learning Series | SC Agents' };
export const dynamic = 'force-dynamic';

export default function AiLearningPage() {
  return <AiLearningHomeClient tracks={TRACKS} totalModules={TOTAL_MODULES} />;
}
