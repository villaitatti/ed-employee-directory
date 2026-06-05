import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
