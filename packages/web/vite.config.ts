import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_DEV_PORT = 5173;

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const rootPkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));

/**
 * Port the API whitelists via `CORS_ORIGIN`, so the dev server and the backend
 * stay in sync when a workspace uses custom ports. Falls back to the default for
 * anything that isn't a URL with an explicit port — including a production origin
 * like `https://ed.example.org`, which has no port to borrow — rather than letting
 * a stray value crash config loading with an opaque `Invalid URL`.
 */
function devServerPort(corsOrigin: string | undefined): number {
  if (!corsOrigin) return DEFAULT_DEV_PORT;
  try {
    return Number(new URL(corsOrigin).port) || DEFAULT_DEV_PORT;
  } catch {
    console.warn(`[vite] CORS_ORIGIN is not a valid URL (${corsOrigin}); serving on ${DEFAULT_DEV_PORT}.`);
    return DEFAULT_DEV_PORT;
  }
}

export default defineConfig(({ mode }) => {
  // The monorepo keeps a single .env at the root; load it here so VITE_* vars
  // (API base URL, dev-skip-auth) reach the client during `pnpm dev`.
  const env = loadEnv(mode, rootDir, '');

  return {
    plugins: [react(), tailwindcss()],
    envDir: rootDir,
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      __APP_VERSION__: JSON.stringify(rootPkg.version),
    },
    server: {
      port: devServerPort(env.CORS_ORIGIN),
      // Falling back to a free port would silently serve on an origin the API
      // rejects, which is the mismatch this whole block exists to prevent.
      strictPort: true,
    },
  };
});
