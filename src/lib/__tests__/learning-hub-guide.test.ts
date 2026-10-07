import { describe, expect, it } from 'vitest';
import {
  courseInPath,
  formatLearnerTime,
  guideForTrack,
  levelInPath,
  roleByKey,
} from '@/lib/learning-hub-guide';

const guide = guideForTrack('supply_chain')!;

/**
 * The guide decides what a learner is shown, so what is pinned here is the join between it and the
 * database — the role key that a saved choice points at, and the course title that is the only
 * thing tying a level to a real course. Both are silent when they break: a stale role key or a
 * renamed course un-curates somebody rather than erroring.
 */

describe('the Supply Chain guide', () => {
  it('describes the three levels and twelve roles', () => {
    expect(guide.levels.map((l) => l.key)).toEqual(['L1', 'L2', 'L3']);
    expect(guide.roles).toHaveLength(12);
  });

  it('gives every role a unique key', () => {
    const keys = guide.roles.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /* Every level has to name a course that exists, or its card links nowhere and the curation
     reports the whole course as "beyond your role". */
  it('names the courses the database actually holds', () => {
    expect(guide.levels.map((l) => l.courseTitle)).toEqual([
      'Supply Chain Fundamentals',
      'Supply Chain Professional',
      'Supply Chain Expert',
    ]);
  });

  /* A role that names a release the level does not have would dim every release on that card. */
  it('only ever names releases its level really has', () => {
    for (const role of guide.roles) {
      for (const take of role.takes) {
        const level = guide.levels.find((l) => l.key === take.level)!;
        for (const title of take.releases ?? []) {
          expect(level.releases.map((r) => r.title), `${role.key} / ${take.level}`).toContain(title);
        }
      }
    }
  });

  it('starts every path at Level 1', () => {
    for (const role of guide.roles) {
      expect(role.takes[0]?.level, role.key).toBe('L1');
    }
  });
});

describe('roleByKey', () => {
  it('finds a role by its stored key', () => {
    expect(roleByKey(guide, 'buyer')?.role).toBe('Buyer or category specialist');
  });

  /* A key stored before a role was renamed or dropped resolves to null, which the caller turns
     into "no choice made" — an uncurated list, not a curated-for-nobody one. */
  it('returns null for a key the guide no longer has, and for no key at all', () => {
    expect(roleByKey(guide, 'retired-role')).toBeNull();
    expect(roleByKey(guide, null)).toBeNull();
    expect(roleByKey(guide, '')).toBeNull();
  });
});

describe('levelInPath', () => {
  const buyer = roleByKey(guide, 'buyer')!;
  const manager = roleByKey(guide, 'sc-manager')!;

  it('separates "all of it" from "these releases of it"', () => {
    expect(levelInPath(buyer, 'L1')).toEqual({ included: true, releases: null });
    expect(levelInPath(buyer, 'L2')).toEqual({
      included: true,
      releases: ['Supply, Logistics & Trade'],
    });
  });

  it('reports a level outside the path', () => {
    expect(levelInPath(buyer, 'L3').included).toBe(false);
  });

  it('gives the manager every level whole', () => {
    for (const key of ['L1', 'L2', 'L3'] as const) {
      expect(levelInPath(manager, key)).toEqual({ included: true, releases: null });
    }
  });
});

describe('courseInPath', () => {
  const buyer = roleByKey(guide, 'buyer')!;

  it('names the releases of a partly-taken course', () => {
    expect(courseInPath(guide, buyer, 'Supply Chain Professional')).toEqual({
      level: guide.levels[1],
      included: true,
      releases: ['Supply, Logistics & Trade'],
    });
  });

  it('reports null releases for a course taken whole, which is not the same as none', () => {
    const r = courseInPath(guide, buyer, 'Supply Chain Fundamentals');
    expect(r.included).toBe(true);
    expect(r.releases).toBeNull();
  });

  it('excludes a course outside the path', () => {
    expect(courseInPath(guide, buyer, 'Supply Chain Expert').included).toBe(false);
  });

  /* With no role chosen nothing is in the path, so every card renders plainly rather than every
     card rendering as "beyond your role". */
  it('includes nothing when no role has been chosen', () => {
    expect(courseInPath(guide, null, 'Supply Chain Fundamentals').included).toBe(false);
  });

  /* A course the guide has never heard of is reported as outside the path rather than guessed at,
     so adding a course to the track does not silently recommend it to everybody. */
  it('does not guess about a course the guide does not describe', () => {
    const r = courseInPath(guide, buyer, 'Something New');
    expect(r.level).toBeNull();
    expect(r.included).toBe(false);
  });
});

describe('formatLearnerTime', () => {
  it.each([
    [45, '45 m'],
    [60, '1 h 0 m'],
    [171, '2 h 51 m'],
    [0, '0 m'],
  ])('writes %i minutes as %s', (minutes, expected) => {
    expect(formatLearnerTime(minutes)).toBe(expected);
  });
});
