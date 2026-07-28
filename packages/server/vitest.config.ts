import { defineConfig } from 'vitest/config';

// Integration tests boot the real Express app against a local Postgres test
// database with auth bypassed. Unit tests import no DB code, so they never
// connect — the integration suite gates itself on DB reachability and skips
// cleanly when Postgres is unavailable (e.g. CI without a service container).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Every integration suite shares one Postgres database and truncates it
    // between cases, so running suites in parallel makes them wipe each other's
    // fixtures. Serialize the files; the whole suite still runs in a few seconds.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DEV_SKIP_AUTH: 'true',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://ed@localhost:55433/ed_employee_directory_test',
    },
  },
});
