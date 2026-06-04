import 'dotenv/config';
import { z } from 'zod';

const optionalUrl = z.string().url().or(z.literal('')).optional();
const booleanFlag = z
  .enum(['true', 'false'])
  .or(z.literal(''))
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
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
  if (env.NODE_ENV === 'production' && !env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN is required in production.');
  }
  if (!env.DEV_SKIP_AUTH && (!env.AUTH0_DOMAIN || !env.AUTH0_AUDIENCE)) {
    throw new Error('AUTH0_DOMAIN and AUTH0_AUDIENCE are required when DEV_SKIP_AUTH is false.');
  }

  return env;
}

export const env = loadEnv();
