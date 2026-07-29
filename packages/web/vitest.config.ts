import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootPkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  plugins: [react()],
  // Same `@` alias as vite.config.ts, so the shadcn components resolve in tests.
  // The Tailwind plugin is deliberately absent: Vitest stubs CSS imports, so the
  // stylesheet is never compiled here and the plugin would only cost startup time.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
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
