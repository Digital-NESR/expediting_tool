import { describe, expect, it } from 'vitest';
import { describeFetchFailure } from '@/lib/soa/mail';

/**
 * Node reports every network-level failure as "fetch failed" and hides the reason in `cause`.
 * A champion reading that on a toast has been told nothing, and the three commonest causes have
 * three completely different fixes.
 */
const failure = (code: string): Error => {
  const err = new Error('fetch failed');
  (err as Error & { cause?: unknown }).cause = Object.assign(new Error(code), { code });
  return err;
};

const URL_ = 'https://n8n.example.com/webhook/soa-mail';

describe('describeFetchFailure', () => {
  it('names a hostname that does not resolve', () => {
    const out = describeFetchFailure(failure('ENOTFOUND'), URL_);
    expect(out).toContain('does not resolve');
    expect(out).toContain('https://n8n.example.com');
    expect(out).not.toContain('fetch failed');
  });

  it('points a refused connection at the workflow being unpublished', () => {
    // The commonest real cause: the editor is open but nothing is listening on the production URL.
    expect(describeFetchFailure(failure('ECONNREFUSED'), URL_)).toContain('published');
  });

  it('says when the host simply never answers', () => {
    expect(describeFetchFailure(failure('ETIMEDOUT'), URL_)).toContain('not reachable from the internet');
  });

  it('distinguishes the certificate failures from each other', () => {
    expect(describeFetchFailure(failure('CERT_HAS_EXPIRED'), URL_)).toContain('expired');
    expect(describeFetchFailure(failure('UNABLE_TO_VERIFY_LEAF_SIGNATURE'), URL_)).toContain(
      'incomplete',
    );
    expect(describeFetchFailure(failure('DEPTH_ZERO_SELF_SIGNED_CERT'), URL_)).toContain(
      'self-signed',
    );
  });

  it('still names the host when the code is one it does not know', () => {
    const out = describeFetchFailure(failure('ESOMETHINGNEW'), URL_);
    expect(out).toContain('https://n8n.example.com');
    expect(out).toContain('ESOMETHINGNEW');
  });

  it('does not fall over on a failure with no cause at all', () => {
    expect(() => describeFetchFailure(new Error('fetch failed'), URL_)).not.toThrow();
    expect(describeFetchFailure(new Error('fetch failed'), URL_)).toContain('n8n.example.com');
  });

  it('falls back to the raw string when the URL will not parse', () => {
    expect(describeFetchFailure(failure('ENOTFOUND'), 'not a url')).toContain('not a url');
  });
});
