import { describe, expect, it } from 'vitest';

import { SEED_TRACKS, type SeedLesson } from '@/lib/learning-hub-seed-content';

/**
 * Guards the seed content that ships as code.
 *
 * The lesson viewer drops `videoUrl` straight into an `<iframe src>`, so a URL that cannot be
 * framed renders as an empty box with nothing to say why. That is exactly what happened: one
 * lesson carried a Mimecast link — the per-recipient tracking URL an email security gateway
 * rewrites a link into — wrapping a personal OneDrive share. It could never have framed, and
 * nobody noticed because the course is a draft.
 *
 * Catching it here rather than in review matters more than it looks. Editing this file changes
 * the track's content hash, which makes the next cold start rebuild that track and cascade-
 * delete every learner's progress in it. So a careless paste here is not a cosmetic bug, it is
 * a data-loss event waiting for the next deploy.
 */

/** Hosts a lesson video may be served from. Everything in the seed uses the first one. */
const ALLOWED_VIDEO_HOSTS = ['nesrcorp.sharepoint.com'];

function everyLesson(): { path: string; lesson: SeedLesson }[] {
  const out: { path: string; lesson: SeedLesson }[] = [];
  for (const track of SEED_TRACKS)
    for (const course of track.courses)
      for (const mod of course.modules)
        for (const lesson of mod.lessons)
          out.push({
            path: `${track.key} / ${course.title} / ${mod.title} / ${lesson.title}`,
            lesson,
          });
  return out;
}

describe('seed lesson videos', () => {
  const lessons = everyLesson();

  it('has lessons to check', () => {
    expect(lessons.length).toBeGreaterThan(0);
  });

  it('serves every video from an allowed host', () => {
    const offenders = lessons
      .filter((l) => l.lesson.videoUrl)
      .map((l) => ({ path: l.path, url: l.lesson.videoUrl as string }))
      .filter(({ url }) => {
        let host: string;
        try {
          host = new URL(url).hostname;
        } catch {
          return true;
        }
        return !ALLOWED_VIDEO_HOSTS.includes(host);
      });
    expect(offenders).toEqual([]);
  });

  /* A personal OneDrive share dies with the account and will not frame. Named separately from
     the host check so a failure says which problem it is. */
  it('uses no personal OneDrive or link-rewrite URL', () => {
    const banned = ['1drv.ms', 'mimecastprotect.com', 'urldefense', '-my.sharepoint.com'];
    const offenders = lessons
      .filter((l) => l.lesson.videoUrl)
      .filter((l) => banned.some((b) => (l.lesson.videoUrl as string).includes(b)))
      .map((l) => l.path);
    expect(offenders).toEqual([]);
  });

  it('has no empty or whitespace-only video URL', () => {
    const offenders = lessons
      .filter((l) => l.lesson.videoUrl !== undefined && l.lesson.videoUrl.trim() === '')
      .map((l) => l.path);
    expect(offenders).toEqual([]);
  });
});

describe('seed structure', () => {
  it('gives every track a unique key', () => {
    const keys = SEED_TRACKS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every lesson a title and a body', () => {
    for (const { path, lesson } of everyLesson()) {
      expect(lesson.title.trim(), path).not.toBe('');
      expect(lesson.body.trim(), path).not.toBe('');
    }
  });

  /* Course status decides whether learners see it at all, and the three detail queries filter on
     the literal 'published'. A typo here hides a course with no error anywhere. */
  it('uses only the two known course statuses', () => {
    for (const track of SEED_TRACKS)
      for (const course of track.courses)
        expect(['draft', 'published'], `${track.key} / ${course.title}`).toContain(course.status);
  });
});
