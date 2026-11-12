import { demoOptions } from '@/lib/icsa/demo';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';

/**
 * The sign-in page. Microsoft SSO for everybody; when ICSA_DEMO_LOGIN=true it also offers the
 * ICSA demo people (src/lib/icsa/demo.ts), read here on the server because the switch is a
 * server-side environment variable.
 */
export default function LoginPage() {
  return <LoginClient demo={demoOptions()} />;
}
