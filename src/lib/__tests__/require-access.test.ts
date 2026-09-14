import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `@/lib/session` pulls in next-auth and the whole auth config, so it is
// replaced wholesale. The factory is hoisted, so it may not close over
// anything defined below.
vi.mock('@/lib/session', () => ({
  getCachedSession: vi.fn(),
}));

import {
  AccessError,
  currentActor,
  forbidden,
  isAdminActor,
  isPlatformAdminEmail,
  isToolAdminEmail,
  normalizeEmail,
  platformAdminEmails,
  requireAdmin,
  requireToolAdmin,
  requireUser,
  withAccessFallback,
} from '@/lib/require-access';
import { getCachedSession } from '@/lib/session';

const mockSession = vi.mocked(getCachedSession);

/** Signed-in session shaped like next-auth's, or null for signed out. */
function signedInAs(email: string | null | undefined, name?: string | null) {
  mockSession.mockResolvedValue(
    (email === undefined ? null : { user: { email, name } }) as unknown as Awaited<ReturnType<typeof getCachedSession>>,
  );
}

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

beforeEach(() => {
  mockSession.mockReset();
  delete process.env.ADMIN_EMAILS;
});

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('MFarhan1@NESR.com')).toBe('mfarhan1@nesr.com');
    expect(normalizeEmail('  mfarhan1@nesr.com  ')).toBe('mfarhan1@nesr.com');
    expect(normalizeEmail('\tMFARHAN1@NESR.COM\n')).toBe('mfarhan1@nesr.com');
  });

  it('collapses every absent value to the empty string', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail()).toBe('');
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail('   ')).toBe('');
  });

  it('is idempotent, so it is safe on both sides of a comparison', () => {
    const once = normalizeEmail('  Mixed.Case@NESR.com ');
    expect(normalizeEmail(once)).toBe(once);
  });

  it('does not otherwise rewrite the address', () => {
    expect(normalizeEmail('first.last+tag@nesr.com')).toBe('first.last+tag@nesr.com');
    expect(normalizeEmail('not an email')).toBe('not an email');
  });
});

describe('platformAdminEmails', () => {
  it('parses a comma-separated list, trimming and lowercasing each entry', () => {
    process.env.ADMIN_EMAILS = ' Admin.One@NESR.com , admin.two@nesr.com ';
    expect(platformAdminEmails()).toEqual(['admin.one@nesr.com', 'admin.two@nesr.com']);
  });

  it('drops empty segments from a sloppy list', () => {
    process.env.ADMIN_EMAILS = 'a@nesr.com,,  , b@nesr.com,';
    expect(platformAdminEmails()).toEqual(['a@nesr.com', 'b@nesr.com']);
  });

  it('is empty when the variable is unset, empty or whitespace', () => {
    delete process.env.ADMIN_EMAILS;
    expect(platformAdminEmails()).toEqual([]);
    process.env.ADMIN_EMAILS = '';
    expect(platformAdminEmails()).toEqual([]);
    process.env.ADMIN_EMAILS = '   ';
    expect(platformAdminEmails()).toEqual([]);
    process.env.ADMIN_EMAILS = ',,,';
    expect(platformAdminEmails()).toEqual([]);
  });

  it('reads the environment on every call, not once at import', () => {
    process.env.ADMIN_EMAILS = 'first@nesr.com';
    expect(platformAdminEmails()).toEqual(['first@nesr.com']);
    process.env.ADMIN_EMAILS = 'second@nesr.com';
    expect(platformAdminEmails()).toEqual(['second@nesr.com']);
  });
});

describe('isPlatformAdminEmail', () => {
  it('matches a listed address regardless of casing or padding', () => {
    process.env.ADMIN_EMAILS = 'Admin.One@NESR.com';
    expect(isPlatformAdminEmail('admin.one@nesr.com')).toBe(true);
    expect(isPlatformAdminEmail('ADMIN.ONE@NESR.COM')).toBe(true);
    expect(isPlatformAdminEmail('  Admin.One@nesr.com  ')).toBe(true);
  });

  it('rejects an address that is not on the list', () => {
    process.env.ADMIN_EMAILS = 'admin.one@nesr.com';
    expect(isPlatformAdminEmail('someone.else@nesr.com')).toBe(false);
    expect(isPlatformAdminEmail('admin.one@evil.com')).toBe(false);
    // No prefix/substring matching.
    expect(isPlatformAdminEmail('admin.one')).toBe(false);
    expect(isPlatformAdminEmail('xadmin.one@nesr.com')).toBe(false);
  });

  it('rejects an empty identity even when the list is sloppy', () => {
    process.env.ADMIN_EMAILS = ',, ,';
    expect(isPlatformAdminEmail('')).toBe(false);
    expect(isPlatformAdminEmail('   ')).toBe(false);
    expect(isPlatformAdminEmail(null)).toBe(false);
    expect(isPlatformAdminEmail(undefined)).toBe(false);
  });

  it('admits nobody when the list is unset or empty', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isPlatformAdminEmail('admin.one@nesr.com')).toBe(false);
    process.env.ADMIN_EMAILS = '';
    expect(isPlatformAdminEmail('admin.one@nesr.com')).toBe(false);
  });
});

describe('isToolAdminEmail', () => {
  it('admits a platform admin to every tool', () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';
    expect(isToolAdminEmail('platform@nesr.com')).toBe(true);
    expect(isToolAdminEmail('platform@nesr.com', 'tool.admin@nesr.com')).toBe(true);
    expect(isToolAdminEmail('platform@nesr.com', '')).toBe(true);
    expect(isToolAdminEmail('platform@nesr.com', undefined)).toBe(true);
  });

  it('admits an address listed only in the tool\'s own variable', () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';
    expect(isToolAdminEmail('tool.admin@nesr.com', ' Tool.Admin@NESR.com , other@nesr.com')).toBe(true);
    expect(isToolAdminEmail('other@nesr.com', 'tool.admin@nesr.com,other@nesr.com')).toBe(true);
  });

  it('rejects an address on neither list', () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';
    expect(isToolAdminEmail('nobody@nesr.com', 'tool.admin@nesr.com')).toBe(false);
    expect(isToolAdminEmail('nobody@nesr.com')).toBe(false);
  });

  it('works with no platform list at all', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isToolAdminEmail('tool.admin@nesr.com', 'tool.admin@nesr.com')).toBe(true);
    expect(isToolAdminEmail('nobody@nesr.com', 'tool.admin@nesr.com')).toBe(false);
  });

  it('rejects an empty identity against an empty or whitespace tool list', () => {
    process.env.ADMIN_EMAILS = '';
    expect(isToolAdminEmail('', '')).toBe(false);
    expect(isToolAdminEmail(null, '   ')).toBe(false);
    expect(isToolAdminEmail(undefined, ',,')).toBe(false);
  });
});

describe('currentActor', () => {
  it('returns a lowercased actor for a signed-in session', () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';
    signedInAs('MFarhan1@NESR.com', 'Mohammed Farhan');
    return expect(currentActor()).resolves.toEqual({
      email: 'mfarhan1@nesr.com',
      name: 'Mohammed Farhan',
      isPlatformAdmin: false,
    });
  });

  it('flags a platform admin', async () => {
    process.env.ADMIN_EMAILS = 'Platform@NESR.com';
    signedInAs('platform@nesr.com');
    expect((await currentActor())?.isPlatformAdmin).toBe(true);
  });

  it('falls back to the email when the session carries no name', async () => {
    signedInAs('mfarhan1@nesr.com', null);
    expect((await currentActor())?.name).toBe('mfarhan1@nesr.com');
  });

  it('returns null when signed out or when the session has no email', async () => {
    mockSession.mockResolvedValue(null as never);
    expect(await currentActor()).toBeNull();

    signedInAs(null);
    expect(await currentActor()).toBeNull();

    signedInAs('   ');
    expect(await currentActor()).toBeNull();
  });
});

describe('isAdminActor', () => {
  it('is true only for a signed-in platform admin', async () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';

    signedInAs('platform@nesr.com');
    expect(await isAdminActor()).toBe(true);

    signedInAs('someone@nesr.com');
    expect(await isAdminActor()).toBe(false);

    mockSession.mockResolvedValue(null as never);
    expect(await isAdminActor()).toBe(false);
  });
});

describe('require* guards', () => {
  it('requireUser returns the actor when signed in', async () => {
    signedInAs('mfarhan1@nesr.com', 'Mohammed Farhan');
    expect((await requireUser()).email).toBe('mfarhan1@nesr.com');
  });

  it('requireUser throws a 401 AccessError when signed out', async () => {
    mockSession.mockResolvedValue(null as never);
    await expect(requireUser()).rejects.toBeInstanceOf(AccessError);
    await expect(requireUser()).rejects.toMatchObject({ status: 401, message: 'Sign in required.' });
  });

  it('requireAdmin throws a 403 for a signed-in non-admin', async () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';
    signedInAs('someone@nesr.com');
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403, message: 'Admins only.' });
  });

  it('requireAdmin admits a platform admin', async () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';
    signedInAs('Platform@NESR.com');
    expect((await requireAdmin()).isPlatformAdmin).toBe(true);
  });

  it('requireAdmin prefers the 401 when signed out', async () => {
    mockSession.mockResolvedValue(null as never);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });

  it('requireToolAdmin admits the tool list and the platform list', async () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';

    signedInAs('tool.admin@nesr.com');
    expect((await requireToolAdmin('tool.admin@nesr.com')).email).toBe('tool.admin@nesr.com');

    signedInAs('platform@nesr.com');
    expect((await requireToolAdmin('tool.admin@nesr.com')).email).toBe('platform@nesr.com');
  });

  it('requireToolAdmin rejects a signed-in employee who is on neither list', async () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';
    signedInAs('someone@nesr.com');
    await expect(requireToolAdmin('tool.admin@nesr.com')).rejects.toMatchObject({ status: 403 });
  });

  it('requireToolAdmin rejects everyone but platform admins when no tool list is given', async () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';
    signedInAs('someone@nesr.com');
    await expect(requireToolAdmin()).rejects.toBeInstanceOf(AccessError);
  });
});

describe('AccessError and failure shapes', () => {
  it('defaults to a 403 named AccessError with no internal detail', () => {
    const err = new AccessError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AccessError');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('returns a standard denial object from forbidden()', () => {
    expect(forbidden()).toEqual({ success: false, error: 'Forbidden' });
    expect(forbidden('Admins only.')).toEqual({ success: false, error: 'Admins only.' });
  });
});

describe('withAccessFallback', () => {
  it('passes the value through on success', async () => {
    await expect(withAccessFallback(async () => ['row'], [])).resolves.toEqual(['row']);
  });

  it('swallows an AccessError and returns the fallback', async () => {
    await expect(
      withAccessFallback<string[]>(async () => {
        throw new AccessError();
      }, []),
    ).resolves.toEqual([]);
  });

  it('rethrows any other error so a real failure is never hidden', async () => {
    await expect(
      withAccessFallback(async () => {
        throw new TypeError('db exploded');
      }, null),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('wraps a denied guard for a read page', async () => {
    process.env.ADMIN_EMAILS = 'platform@nesr.com';
    signedInAs('someone@nesr.com');
    await expect(
      withAccessFallback(async () => {
        await requireAdmin();
        return 'secret';
      }, 'empty'),
    ).resolves.toBe('empty');
  });
});
