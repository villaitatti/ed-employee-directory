import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const rootPkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));

export default defineConfig(({ mode }) => {
  // The monorepo keeps a single .env at the root; load it here so VITE_* vars
  // (API base URL, dev-skip-auth) reach the client during `pnpm dev`.
  const env = loadEnv(mode, rootDir, '');
  // Serve on the exact origin the API whitelists via CORS_ORIGIN so the dev
  // server and backend stay in sync when a workspace uses custom ports.
  const corsPort = Number(new URL(env.CORS_ORIGIN || 'http://localhost:5173').port);

  return {
    plugins: [react()],
    envDir: rootDir,
    define: {
      __APP_VERSION__: JSON.stringify(rootPkg.version),
    },
    server: {
      port: corsPort || 5173,
      strictPort: true,
    },
  };
});
