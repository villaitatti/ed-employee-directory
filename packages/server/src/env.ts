import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
// Type-only import inside this module keeps it free of Prisma at runtime, so the
// env loader stays a leaf and cannot form an import cycle.
import { parseAppRoleAssignments } from './services/time-off-directory.js';

// This package runs from packages/server (pnpm sets the cwd there), so the
// default dotenv lookup misses the monorepo root .env that the README tells you
// to create. Resolve both explicitly relative to this file — which sits one level
// down in either src/ or dist/ — so `pnpm dev` and the built server behave alike.
// A package-local .env is listed first because dotenv never overwrites a value
// that is already set, which keeps the pre-existing per-package override working.
// In production neither path exists and dotenv is a no-op: env comes from the
// container.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: [resolve(packageRoot, '.env'), resolve(packageRoot, '../../.env')] });

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
  // Distinct from AUTH0_READ_SCOPE: the time-off directory's preferred-language
  // endpoint is the first write access granted to a machine-to-machine caller, so
  // a read-only token must not be able to reach it.
  AUTH0_WRITE_SCOPE: z.string().min(1).default('write:time-off-directory'),
  // Employee-number-to-application-role grants for the Ferie projection, e.g.
  // "201:STAFF_IT|FERIE_PORTAL_ADMIN,202:FERIE_FINAL_APPROVER". ED holds no
  // application-role master data yet, so this is the only source of those roles.
  TIME_OFF_DIRECTORY_ROLES: z.string().default(''),
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
  // Fail at boot on a typo'd role grant rather than silently syncing employees
  // with no application roles, which would lock administration out of the portal.
  try {
    parseAppRoleAssignments(env.TIME_OFF_DIRECTORY_ROLES);
  } catch (error) {
    throw new Error(
      `Invalid TIME_OFF_DIRECTORY_ROLES: ${error instanceof Error ? error.message : 'unparseable value.'}`
    );
  }

  return env;
}

export const env = loadEnv();
