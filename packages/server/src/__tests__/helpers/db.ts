import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma client for integration tests. Points at DATABASE_URL, which
 * vitest.config.ts pins to the local Postgres test database.
 */
export const testPrisma = new PrismaClient();

/** True when the test database is reachable; integration suites skip when not. */
export async function isDbReachable(): Promise<boolean> {
  try {
    await testPrisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Wipe all rows between tests so each case starts from a known empty state. */
export async function resetDb(): Promise<void> {
  // Order matters: children before parents to respect FK constraints. TRUNCATE
  // ... CASCADE keeps it simple and resets identity sequences too.
  await testPrisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "ImportRow", "ImportBatch", "EmployeeApprovalAssignment", "Employee", "Department", "Setting" RESTART IDENTITY CASCADE'
  );
}
