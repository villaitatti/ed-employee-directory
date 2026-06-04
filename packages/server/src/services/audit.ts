import { Prisma, type AuditAction, type EntityType } from '@prisma/client';
import type { AuthUser } from '../middleware/auth.js';

type AuditInput = {
  tx: Prisma.TransactionClient;
  user: AuthUser;
  requestId: string;
  entityType: EntityType;
  entityId?: string | null;
  employeeNumber?: number | null;
  action: AuditAction;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  importBatchId?: string | null;
};

export async function writeAuditLog(input: AuditInput) {
  const data: Prisma.AuditLogCreateInput = {
    actorSub: input.user.sub,
    actorEmail: input.user.email ?? null,
    entityType: input.entityType,
    action: input.action,
    requestId: input.requestId,
  };

  if (input.entityId !== undefined) data.entityId = input.entityId;
  if (input.employeeNumber !== undefined) data.employeeNumber = input.employeeNumber;
  if (input.before !== undefined) data.before = input.before === null ? Prisma.JsonNull : input.before;
  if (input.after !== undefined) data.after = input.after === null ? Prisma.JsonNull : input.after;
  if (input.importBatchId) data.importBatch = { connect: { id: input.importBatchId } };

  return input.tx.auditLog.create({
    data,
  });
}
