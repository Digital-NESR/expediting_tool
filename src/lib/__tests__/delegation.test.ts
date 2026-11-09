import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The delegation hub is optional infrastructure that is currently absent, so what matters is not
 * only that a missing database degrades to "no delegations" but that it stops being dialled.
 *
 * A connection to a database that does not exist is never pooled, so every call paid a full TCP
 * and TLS handshake -- ~260ms against the configured server, against 9ms for a pooled query.
 * Catalog Repo awaits this on every page load and every server action, which is what made it
 * feel slower than every other tool.
 */

const query = vi.fn();
vi.mock('@/lib/db-delegation', () => ({ default: { query: (...a: unknown[]) => query(...a) } }));

const missingDatabase = () =>
  Object.assign(new Error('database does not exist'), { code: '3D000' });

describe('getDelegatorsForApp', () => {
  beforeEach(() => {
    vi.resetModules();
    query.mockReset();
    vi.useRealTimers();
  });

  it('returns the delegators the hub reports', async () => {
    query.mockResolvedValue({
      rows: [{ delegator_email: 'a@nesr.com', delegator_name: 'A Name' }],
      rowCount: 1,
    });
    const { getDelegatorsForApp } = await import('@/lib/delegation');
    await expect(getDelegatorsForApp('me@nesr.com', 'catalog')).resolves.toEqual([
      { email: 'a@nesr.com', name: 'A Name' },
    ]);
  });

  it('never touches the pool without an email', async () => {
    const { getDelegatorsForApp } = await import('@/lib/delegation');
    await expect(getDelegatorsForApp('', 'catalog')).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('degrades to no delegations when the hub database is missing', async () => {
    query.mockRejectedValue(missingDatabase());
    const { getDelegatorsForApp } = await import('@/lib/delegation');
    await expect(getDelegatorsForApp('me@nesr.com', 'catalog')).resolves.toEqual([]);
  });

  it('stops dialling a hub that is not there', async () => {
    query.mockRejectedValue(missingDatabase());
    const { getDelegatorsForApp } = await import('@/lib/delegation');

    await getDelegatorsForApp('me@nesr.com', 'catalog');
    expect(query).toHaveBeenCalledTimes(1);

    // Every later call answers from the open breaker, without a connection attempt.
    for (let i = 0; i < 25; i++) await getDelegatorsForApp('me@nesr.com', 'catalog');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('tries again once the window has passed, so creating the database starts working', async () => {
    query.mockRejectedValue(missingDatabase());
    const { getDelegatorsForApp } = await import('@/lib/delegation');

    await getDelegatorsForApp('me@nesr.com', 'catalog');
    await getDelegatorsForApp('me@nesr.com', 'catalog');
    expect(query).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    query.mockResolvedValue({
      rows: [{ delegator_email: 'b@nesr.com', delegator_name: 'B Name' }],
      rowCount: 1,
    });

    await expect(getDelegatorsForApp('me@nesr.com', 'catalog')).resolves.toEqual([
      { email: 'b@nesr.com', name: 'B Name' },
    ]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps dialling after an unexpected failure, which is not the hub being absent', async () => {
    // A syntax error or a dropped connection says nothing about whether the hub exists, so the
    // breaker must not latch on it and hide a real fault for five minutes.
    query.mockRejectedValue(Object.assign(new Error('syntax error'), { code: '42601' }));
    const { getDelegatorsForApp } = await import('@/lib/delegation');

    await getDelegatorsForApp('me@nesr.com', 'catalog');
    await getDelegatorsForApp('me@nesr.com', 'catalog');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
