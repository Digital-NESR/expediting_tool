import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Several helpers under test build dates from *local* calendar parts
// (catalog `daysUntil`, the S&S registry date helpers) while others use UTC
// (TI-TE `calcDays`). Pinning the zone to NESR's HQ offset (+04:00, no DST)
// makes those tests deterministic on every machine and in CI, and keeps the
// UTC-vs-local off-by-one cases honest instead of accidentally passing on a
// UTC runner.
process.env.TZ = 'Asia/Dubai';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      TZ: 'Asia/Dubai',
    },
  },
});
