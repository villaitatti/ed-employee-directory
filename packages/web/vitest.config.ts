import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const rootPkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  // Mirror vite.config.ts so components that read __APP_VERSION__ (the full
  // app shell) can be mounted in tests, not just isolated pages.
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    // Pin env so tests don't depend on a developer's local .env.local.
    // DEV_SKIP_AUTH lets EdAuthProvider supply a demo user without Auth0,
    // so component tests can mount API-driven pages.
    env: {
      VITE_API_BASE_URL: '',
      VITE_DEV_SKIP_AUTH: 'true',
    },
  },
});
