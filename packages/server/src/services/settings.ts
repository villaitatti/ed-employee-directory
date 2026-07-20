import { Prisma } from '@prisma/client';
import { DEFAULT_RETIREMENT_POLICY, retirementPolicySchema, type RetirementPolicy } from '@itatti/shared';
import { logger } from '../lib/logger.js';

export const RETIREMENT_POLICY_KEY = 'retirementPolicy';

type Reader = Prisma.TransactionClient | { setting: Prisma.TransactionClient['setting'] };

function parsePolicy(value: Prisma.JsonValue | undefined): RetirementPolicy {
  // A missing row (value === undefined/null) is the normal "never configured"
  // case — fall back to the statutory default silently.
  if (value === undefined || value === null) {
    return DEFAULT_RETIREMENT_POLICY;
  }
  // A row that EXISTS but doesn't parse means the stored policy is corrupt or
  // out of the currently-allowed bounds. Don't silently serve the code default
  // as if it were the configured value — log loudly so it can be investigated.
  const parsed = retirementPolicySchema.safeParse(value);
  if (!parsed.success) {
    logger.error(
      { storedValue: value, issues: parsed.error.issues },
      'Stored retirement policy is malformed; falling back to the statutory default. Investigate the Setting row.'
    );
    return DEFAULT_RETIREMENT_POLICY;
  }
  return parsed.data;
}

/** Current retirement policy, falling back to the statutory default when unset. */
export async function getRetirementPolicy(reader: Reader): Promise<RetirementPolicy> {
  const row = await reader.setting.findUnique({ where: { key: RETIREMENT_POLICY_KEY } });
  return parsePolicy(row?.value);
}

export async function getRetirementSetting(
  reader: Reader
): Promise<{ retirementPolicy: RetirementPolicy; updatedAt: string | null; malformed: boolean }> {
  const row = await reader.setting.findUnique({ where: { key: RETIREMENT_POLICY_KEY } });
  // A row that exists but doesn't parse means the stored policy is corrupt. Flag
  // it so the UI can warn instead of presenting the fallback default as if it
  // were the configured value.
  const malformed = row?.value != null && !retirementPolicySchema.safeParse(row.value).success;
  return {
    retirementPolicy: parsePolicy(row?.value),
    updatedAt: row ? row.updatedAt.toISOString() : null,
    malformed,
  };
}
