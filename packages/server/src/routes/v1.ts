import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { employeeListQuerySchema, isValidEmployeeNumber, languageSchema } from '@itatti/shared';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireReadAccess, requireWriteAccess, type AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { HttpError } from '../middleware/error.js';
import { serializeDepartment, serializeEmployee } from '../services/serializers.js';
import { employeeDetailsInclude } from '../services/approvals.js';
import { writeAuditLog } from '../services/audit.js';
import { env } from '../env.js';
import { parseAppRoleAssignments, projectTimeOffEmployee } from '../services/time-off-directory.js';

export const v1Router = Router();

// Authentication is router-wide; authorization is per route, because the
// time-off-directory write endpoint answers to its own scope rather than to the
// read scope every other v1 route requires.
v1Router.use(requireAuth);

// Parsed once at module load: the value is validated at boot by loadEnv, and the
// projection is a hot path during a full portal sync.
const appRoleAssignments = parseAppRoleAssignments(env.TIME_OFF_DIRECTORY_ROLES);

const timeOffDirectoryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

const preferredLanguageWriteSchema = z
  .object({
    preferredLanguage: languageSchema,
  })
  // The portal may write this one field and nothing else, so an unexpected key is
  // a rejected request rather than a silently ignored one.
  .strict();

const MAX_REQUEST_ID_LENGTH = 200;

function requestId(req: AuthenticatedRequest): string {
  const header = req.headers['x-request-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.slice(0, MAX_REQUEST_ID_LENGTH) || `req_${Date.now().toString(36)}`;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

v1Router.get(
  '/departments',
  requireReadAccess,
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ data: departments.map(serializeDepartment) });
  })
);

v1Router.get(
  '/employees',
  requireReadAccess,
  asyncHandler(async (req, res) => {
    const query = employeeListQuerySchema.parse(req.query);
    const where = {} as Prisma.EmployeeWhereInput;
    if (query.status) where.status = query.status;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.updatedSince) where.updatedAt = { gte: new Date(query.updatedSince) };
    const employees = await prisma.employee.findMany({
      where,
      include: employeeDetailsInclude,
      orderBy: [{ employeeNumber: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasNext = employees.length > query.limit;
    const page = hasNext ? employees.slice(0, query.limit) : employees;
    res.json({
      data: page.map(serializeEmployee),
      nextCursor: hasNext ? page.at(-1)?.id ?? null : null,
    });
  })
);

/**
 * The projection the Ferie portal syncs from. Responds with `items` (not `data`)
 * because the shape is fixed by the external contract, not by this app's
 * conventions.
 */
v1Router.get(
  '/time-off-directory/employees',
  requireReadAccess,
  asyncHandler(async (req, res) => {
    const query = timeOffDirectoryQuerySchema.parse(req.query);
    const employees = await prisma.employee.findMany({
      include: employeeDetailsInclude,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasNext = employees.length > query.limit;
    const page = hasNext ? employees.slice(0, query.limit) : employees;
    res.json({
      items: page.map((employee) => projectTimeOffEmployee(employee, appRoleAssignments)),
      nextCursor: hasNext ? page.at(-1)?.id ?? null : null,
    });
  })
);

/**
 * The only write ED exposes to a machine-to-machine caller. The portal asserts
 * which employee the change is for: an M2M token carries no end-user identity, so
 * ED cannot verify the change originated with that employee.
 */
v1Router.patch(
  '/time-off-directory/employees/:id/preferred-language',
  requireWriteAccess,
  asyncHandler(async (req, res) => {
    const input = preferredLanguageWriteSchema.parse(req.body);
    const user = (req as AuthenticatedRequest).authUser;
    const id = requestId(req as AuthenticatedRequest);
    const employeeId = req.params.id ?? '';

    const preferredLanguage = await prisma.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({
        where: { id: employeeId },
        include: employeeDetailsInclude,
      });
      if (!before) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');

      // Scoped to the single column so this route cannot become a general-purpose
      // employee write even if the request body grows a field later.
      await tx.employee.update({
        where: { id: employeeId },
        data: { preferredLanguage: input.preferredLanguage },
      });
      const after = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: employeeDetailsInclude,
      });
      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'EMPLOYEE',
        entityId: after.id,
        employeeNumber: after.employeeNumber,
        action: 'UPDATE',
        before: jsonSnapshot(serializeEmployee(before)),
        after: jsonSnapshot(serializeEmployee(after)),
      });
      return after.preferredLanguage;
    });

    res.json({ preferredLanguage });
  })
);

v1Router.get(
  '/employees/:employeeNumber',
  requireReadAccess,
  asyncHandler(async (req, res) => {
    const employeeNumber = Number(req.params.employeeNumber);
    if (!isValidEmployeeNumber(employeeNumber)) {
      throw new HttpError(400, 'INVALID_EMPLOYEE_NUMBER', 'Employee Number must be a positive integer.');
    }

    const employee = await prisma.employee.findUnique({
      where: { employeeNumber },
      include: employeeDetailsInclude,
    });
    if (!employee) {
      throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'No employee exists with that Employee Number.');
    }

    res.json({ data: serializeEmployee(employee) });
  })
);
