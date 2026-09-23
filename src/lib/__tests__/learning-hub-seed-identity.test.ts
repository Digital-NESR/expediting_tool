import { describe, expect, it } from 'vitest';
import { SEED_TRACKS } from '@/lib/learning-hub-seed-content';

/**
 * The seed sync matches existing rows to seed entries BY TITLE within a parent, and that match is
 * what decides whether a learner keeps their progress. Two entries sharing a title under one
 * parent would make the match arbitrary: one of them wins, the other is treated as new, and
 * somebody's completions move to a lesson they never opened.
 *
 * `reconcileTrackCourses` throws when it sees that, which turns a silent mis-attribution into a
 * failed sync. This test catches it a deploy earlier, while the offending content is still in a
 * diff somebody is reading.
 */

const key = (title: string) => title.trim().toLowerCase();

function duplicates(titles: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const title of titles) {
    const k = key(title);
    if (seen.has(k)) dupes.add(title);
    seen.add(k);
  }
  return [...dupes];
}

describe('seed content identity', () => {
  it('gives every course a title unique within its track', () => {
    for (const track of SEED_TRACKS) {
      expect(duplicates(track.courses.map((c) => c.title)), `track "${track.key}"`).toEqual([]);
    }
  });

  it('gives every module a title unique within its course', () => {
    for (const track of SEED_TRACKS) {
      for (const course of track.courses) {
        expect(
          duplicates(course.modules.map((m) => m.title)),
          `${track.key} → "${course.title}"`,
        ).toEqual([]);
      }
    }
  });

  it('gives every lesson a title unique within its module', () => {
    for (const track of SEED_TRACKS) {
      for (const course of track.courses) {
        for (const mod of course.modules) {
          expect(
            duplicates(mod.lessons.map((l) => l.title)),
            `${track.key} → "${course.title}" → "${mod.title}"`,
          ).toEqual([]);
        }
      }
    }
  });

  it('has no title that is blank or differs only by surrounding space', () => {
    // Both would collapse to the same key and behave as a duplicate.
    for (const track of SEED_TRACKS) {
      for (const course of track.courses) {
        expect(course.title.trim(), `${track.key} course title`).not.toBe('');
        for (const mod of course.modules) {
          expect(mod.title.trim(), `${track.key} module title`).not.toBe('');
          for (const lesson of mod.lessons) {
            expect(lesson.title.trim(), `${track.key} lesson title`).not.toBe('');
          }
        }
      }
    }
  });

  it('keeps every seeded lesson pointing at an approved video host, where it has one', () => {
    // A lesson whose URL is not on the embed allowlist renders as a dead panel, and the seed path
    // does not run it through `checkVideoUrl` the way an admin CMS edit does.
    for (const track of SEED_TRACKS) {
      for (const course of track.courses) {
        for (const mod of course.modules) {
          for (const lesson of mod.lessons) {
            if (!lesson.videoUrl) continue;
            expect(lesson.videoUrl, `${lesson.title}`).toMatch(
              /^https:\/\/[a-z0-9.-]*\.(sharepoint|microsoftstream)\.com\//,
            );
          }
        }
      }
    }
  });
});
