import { Router } from 'express';
import { employeeListQuerySchema } from '@itatti/shared';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireReadAccess } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { HttpError } from '../middleware/error.js';
import { serializeDepartment, serializeEmployee } from '../services/serializers.js';

export const v1Router = Router();

v1Router.use(requireAuth, requireReadAccess);

v1Router.get(
  '/departments',
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ data: departments.map(serializeDepartment) });
  })
);

v1Router.get(
  '/employees',
  asyncHandler(async (req, res) => {
    const query = employeeListQuerySchema.parse(req.query);
    const where = {} as import('@prisma/client').Prisma.EmployeeWhereInput;
    if (query.status) where.status = query.status;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.updatedSince) where.updatedAt = { gte: new Date(query.updatedSince) };
    const employees = await prisma.employee.findMany({
      where,
      include: { department: true },
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

v1Router.get(
  '/employees/:employeeNumber',
  asyncHandler(async (req, res) => {
    const employeeNumber = Number(req.params.employeeNumber);
    if (!Number.isInteger(employeeNumber) || employeeNumber <= 0) {
      throw new HttpError(400, 'INVALID_EMPLOYEE_NUMBER', 'Employee Number must be a positive integer.');
    }

    const employee = await prisma.employee.findUnique({
      where: { employeeNumber },
      include: { department: true },
    });
    if (!employee) {
      throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'No employee exists with that Employee Number.');
    }

    res.json({ data: serializeEmployee(employee) });
  })
);
