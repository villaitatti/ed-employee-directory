import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// This package runs from packages/server (pnpm sets the cwd there), so the
// default dotenv lookup misses the monorepo root .env. Resolve it explicitly
// relative to this file so `pnpm dev` picks up local config. In production the
// path won't exist and dotenv is a no-op — env comes from the container.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const optionalUrl = z.string().url().or(z.literal('')).optional();
const booleanFlag = z
  .enum(['true', 'false'])
  .or(z.literal(''))
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  // Required, with no default: the CORS/CSP hardening and the DEV_SKIP_AUTH
  // production guard all key off NODE_ENV, so a deploy that forgets to set it
  // must fail loudly at boot rather than silently run in permissive dev mode.
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: optionalUrl,
  DEV_SKIP_AUTH: booleanFlag,
  AUTH0_DOMAIN: z.string().min(1).optional(),
  AUTH0_AUDIENCE: z.string().min(1).optional(),
  AUTH0_ROLES_CLAIM: z.string().min(1).default('https://itatti.harvard.edu/roles'),
  AUTH0_STAFF_ROLE: z.string().min(1).default('staff-IT'),
  AUTH0_READ_SCOPE: z.string().min(1).default('read:ed'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Missing or invalid environment variables:\n${issues.join('\n')}`);
  }

  const env = result.data;
  if (env.NODE_ENV === 'production' && env.DEV_SKIP_AUTH) {
    throw new Error('DEV_SKIP_AUTH must not be enabled in production.');
  }
  if (env.NODE_ENV === 'production' && !env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN is required in production.');
  }
  if (!env.DEV_SKIP_AUTH && (!env.AUTH0_DOMAIN || !env.AUTH0_AUDIENCE)) {
    throw new Error('AUTH0_DOMAIN and AUTH0_AUDIENCE are required when DEV_SKIP_AUTH is false.');
  }

  return env;
}

export const env = loadEnv();
