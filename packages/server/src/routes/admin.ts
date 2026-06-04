import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { Router, type Request } from 'express';
import multer from 'multer';
import {
  departmentCreateSchema,
  employeeListQuerySchema,
  employeeWriteSchema,
  importCommitSchema,
  normalizeDepartmentName,
  type EmployeeWriteInput,
  type ImportPreviewRow,
} from '@itatti/shared';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { AuthenticatedRequest, requireAuth, requireStaff } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { writeAuditLog } from '../services/audit.js';
import { toEmployeeData } from '../services/employee-input.js';
import { serializeAuditLog, serializeDepartment, serializeEmployee } from '../services/serializers.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

export const adminRouter = Router();
adminRouter.use(requireAuth, requireStaff);

function requestId(req: AuthenticatedRequest): string {
  const header = req.headers['x-request-id'];
  if (typeof header === 'string') return header;
  if (Array.isArray(header) && header[0]) return header[0];
  return crypto.randomUUID();
}

function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !value) {
    throw new HttpError(400, 'MISSING_PATH_PARAM', `Missing path parameter ${name}.`);
  }
  return value;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('it-IT')
    .replace(/[^a-z0-9]+/g, ' ');
}

function readFirst(row: Record<string, string>, aliases: string[]): string {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.includes(normalizeHeader(key))) {
      return value.trim();
    }
  }
  return '';
}

function parseNullableDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;
  const italian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (italian) {
    const [, day = '', month = '', year = ''] = italian;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return trimmed;
}

function parseUsaCategory(value: string): EmployeeWriteInput['usaCategory'] | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === 'exempt') return 'EXEMPT';
  if (normalized === 'non exempt' || normalized === 'non exempted' || normalized === 'non exempt usa') {
    return 'NON_EXEMPT';
  }
  if (normalized === 'other' || normalized === 'altro') return 'OTHER';
  return undefined;
}

function parseContractType(value: string): EmployeeWriteInput['contractType'] | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === 'indeterminato' || normalized === 'permanent') return 'INDETERMINATO';
  if (normalized === 'determinato' || normalized === 'fixed term') return 'DETERMINATO';
  if (normalized === 'contratto usa' || normalized === 'us contract') return 'CONTRATTO_USA';
  if (normalized === 'collaboratore' || normalized === 'collaborator') return 'COLLABORATORE';
  return undefined;
}

function parseStatus(value: string): EmployeeWriteInput['status'] | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === 'attivo' || normalized === 'active') return 'ATTIVO';
  if (normalized === 'cessato' || normalized === 'terminated') return 'CESSATO';
  if (normalized === 'da assumere' || normalized === 'to be hired') return 'DA_ASSUMERE';
  return undefined;
}

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function employeeWhereFromQuery(query: ReturnType<typeof employeeListQuerySchema.parse>): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.updatedSince) where.updatedAt = { gte: new Date(query.updatedSince) };
  if (query.q) {
    const terms: Prisma.EmployeeWhereInput[] = [
      { firstName: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
      { lastName: { contains: query.q, mode: Prisma.QueryMode.insensitive } },
    ];
    if (Number.isInteger(Number(query.q))) {
      terms.push({ employeeNumber: Number(query.q) });
    }
    where.OR = terms;
  }
  return where;
}

adminRouter.get(
  '/departments',
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
    res.json({ data: departments.map(serializeDepartment) });
  })
);

adminRouter.post(
  '/departments',
  asyncHandler(async (req, res) => {
    const input = departmentCreateSchema.parse(req.body);
    const user = (req as AuthenticatedRequest).authUser;
    const id = requestId(req as AuthenticatedRequest);

    const department = await prisma.$transaction(async (tx) => {
      const created = await tx.department.create({
        data: {
          name: input.name,
          normalizedName: normalizeDepartmentName(input.name),
        },
      });
      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'DEPARTMENT',
        entityId: created.id,
        action: 'CREATE',
        after: jsonSnapshot(created),
      });
      return created;
    });

    res.status(201).json({ data: serializeDepartment(department) });
  })
);

adminRouter.put(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const input = departmentCreateSchema.parse(req.body);
    const user = (req as AuthenticatedRequest).authUser;
    const id = requestId(req as AuthenticatedRequest);

    const department = await prisma.$transaction(async (tx) => {
      const departmentId = pathParam(req, 'id');
      const before = await tx.department.findUnique({ where: { id: departmentId } });
      if (!before) throw new HttpError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
      const updated = await tx.department.update({
        where: { id: departmentId },
        data: { name: input.name, normalizedName: normalizeDepartmentName(input.name) },
      });
      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'DEPARTMENT',
        entityId: updated.id,
        action: 'UPDATE',
        before: jsonSnapshot(before),
        after: jsonSnapshot(updated),
      });
      return updated;
    });

    res.json({ data: serializeDepartment(department) });
  })
);

adminRouter.delete(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).authUser;
    const id = requestId(req as AuthenticatedRequest);

    await prisma.$transaction(async (tx) => {
      const departmentId = pathParam(req, 'id');
      const before = await tx.department.findUnique({ where: { id: departmentId } });
      if (!before) throw new HttpError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
      const employeeCount = await tx.employee.count({ where: { departmentId } });
      if (employeeCount > 0) {
        throw new HttpError(409, 'DEPARTMENT_IN_USE', 'Departments referenced by employees cannot be deleted.');
      }
      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'DEPARTMENT',
        entityId: before.id,
        action: 'DELETE',
        before: jsonSnapshot(before),
      });
      await tx.department.delete({ where: { id: departmentId } });
    });

    res.status(204).send();
  })
);

adminRouter.get(
  '/employees',
  asyncHandler(async (req, res) => {
    const query = employeeListQuerySchema.parse(req.query);
    const employees = await prisma.employee.findMany({
      where: employeeWhereFromQuery(query),
      include: { department: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { employeeNumber: 'asc' }],
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

adminRouter.post(
  '/employees',
  asyncHandler(async (req, res) => {
    const input = employeeWriteSchema.parse(req.body);
    const user = (req as AuthenticatedRequest).authUser;
    const id = requestId(req as AuthenticatedRequest);

    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: toEmployeeData(input),
        include: { department: true },
      });
      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'EMPLOYEE',
        entityId: created.id,
        employeeNumber: created.employeeNumber,
        action: 'CREATE',
        after: jsonSnapshot(serializeEmployee(created)),
      });
      return created;
    });

    res.status(201).json({ data: serializeEmployee(employee) });
  })
);

adminRouter.put(
  '/employees/:id',
  asyncHandler(async (req, res) => {
    const input = employeeWriteSchema.parse(req.body);
    const user = (req as AuthenticatedRequest).authUser;
    const id = requestId(req as AuthenticatedRequest);

    const employee = await prisma.$transaction(async (tx) => {
      const employeeId = pathParam(req, 'id');
      const before = await tx.employee.findUnique({ where: { id: employeeId }, include: { department: true } });
      if (!before) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: toEmployeeData(input),
        include: { department: true },
      });
      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'EMPLOYEE',
        entityId: updated.id,
        employeeNumber: updated.employeeNumber,
        action: 'UPDATE',
        before: jsonSnapshot(serializeEmployee(before)),
        after: jsonSnapshot(serializeEmployee(updated)),
      });
      return updated;
    });

    res.json({ data: serializeEmployee(employee) });
  })
);

adminRouter.delete(
  '/employees/:id',
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).authUser;
    const id = requestId(req as AuthenticatedRequest);

    await prisma.$transaction(async (tx) => {
      const employeeId = pathParam(req, 'id');
      const before = await tx.employee.findUnique({ where: { id: employeeId }, include: { department: true } });
      if (!before) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'EMPLOYEE',
        entityId: before.id,
        employeeNumber: before.employeeNumber,
        action: 'DELETE',
        before: jsonSnapshot(serializeEmployee(before)),
      });
      await tx.employee.delete({ where: { id: employeeId } });
    });

    res.status(204).send();
  })
);

adminRouter.get(
  '/employees/export.csv',
  asyncHandler(async (req, res) => {
    const query = employeeListQuerySchema.parse(req.query);
    const employees = await prisma.employee.findMany({
      where: employeeWhereFromQuery(query),
      include: { department: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const rows = [
      [
        'Employee Number',
        'First Name',
        'Last Name',
        'Department',
        'Birth Date',
        'Hire Date',
        'Termination Date',
        'Retirement Date',
        'Retirement Date Overridden',
        'FTE',
        'USA Category',
        'Contract Type',
        'Status',
      ],
      ...employees.map((employee) => {
        const serialized = serializeEmployee(employee);
        return [
          serialized.employeeNumber,
          serialized.firstName,
          serialized.lastName,
          serialized.department?.name ?? '',
          serialized.birthDate,
          serialized.hireDate,
          serialized.terminationDate,
          serialized.retirementDate,
          serialized.retirementDateOverridden,
          serialized.fte,
          serialized.usaCategory,
          serialized.contractType,
          serialized.status,
        ];
      }),
    ];
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="ed-employees.csv"');
    res.send(rows.map((row) => row.map(csvEscape).join(',')).join('\n'));
  })
);

adminRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const employeeNumber =
      typeof req.query.employeeNumber === 'string' ? Number(req.query.employeeNumber) : undefined;
    const where: Prisma.AuditLogWhereInput = {};
    if (typeof employeeNumber === 'number' && Number.isInteger(employeeNumber)) {
      where.employeeNumber = employeeNumber;
    }
    if (typeof req.query.entityType === 'string') where.entityType = req.query.entityType as never;
    if (typeof req.query.action === 'string') where.action = req.query.action as never;
    if (typeof req.query.actor === 'string') where.actorSub = req.query.actor;
    if (typeof req.query.importBatchId === 'string') where.importBatchId = req.query.importBatchId;
    const auditLogs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ data: auditLogs.map(serializeAuditLog) });
  })
);

adminRouter.post(
  '/imports/preview',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, 'CSV_REQUIRED', 'Upload a CSV file in the file field.');

    const records = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    }) as Record<string, string>[];

    const [departments, employees] = await Promise.all([
      prisma.department.findMany(),
      prisma.employee.findMany({ select: { id: true, employeeNumber: true } }),
    ]);
    const departmentByName = new Map(departments.map((department) => [department.normalizedName, department]));
    const employeeByNumber = new Map(employees.map((employee) => [employee.employeeNumber, employee]));
    const employeeNumberRows = new Map<number, number[]>();
    for (const [index, row] of records.entries()) {
      const employeeNumber = Number(readFirst(row, ['numero matricola', 'employee number', 'employee id']));
      if (Number.isInteger(employeeNumber) && employeeNumber > 0) {
        const rowNumbers = employeeNumberRows.get(employeeNumber) ?? [];
        rowNumbers.push(index + 2);
        employeeNumberRows.set(employeeNumber, rowNumbers);
      }
    }

    const previewRows: ImportPreviewRow[] = records.map((row, index) => {
      const rowNumber = index + 2;
      const departmentName = readFirst(row, ['dipartimento', 'department']);
      const department = departmentByName.get(normalizeDepartmentName(departmentName));
      const employeeNumber = Number(readFirst(row, ['numero matricola', 'employee number', 'employee id']));
      const errors: string[] = [];

      if (!departmentName) errors.push('Department is required.');
      if (departmentName && !department) errors.push(`Unknown department: ${departmentName}.`);
      if (!Number.isInteger(employeeNumber) || employeeNumber <= 0) errors.push('Employee Number must be a positive integer.');
      const duplicateRows = employeeNumberRows.get(employeeNumber) ?? [];
      if (duplicateRows.length > 1) {
        errors.push(`Employee Number ${employeeNumber} appears more than once in this CSV (rows ${duplicateRows.join(', ')}).`);
      }

      const rawInput = {
        employeeNumber,
        firstName: readFirst(row, ['nome', 'first name', 'firstname']),
        lastName: readFirst(row, ['cognome', 'last name', 'lastname']),
        departmentId: department?.id ?? '',
        birthDate: parseNullableDate(readFirst(row, ['data di nascita', 'birth date', 'birthdate'])),
        hireDate: parseNullableDate(readFirst(row, ['data assunzione', 'hire date', 'hiredate'])),
        terminationDate: parseNullableDate(readFirst(row, ['data cessazione', 'termination date', 'terminationdate'])),
        retirementDate: parseNullableDate(readFirst(row, ['data pensionamento', 'retirement date', 'retirementdate'])),
        fte: readFirst(row, ['fte']),
        usaCategory: parseUsaCategory(readFirst(row, ['categoria usa', 'usa category'])),
        contractType: parseContractType(readFirst(row, ['tipo contratto', 'contract type'])),
        status: parseStatus(readFirst(row, ['stato', 'status'])),
      };

      const parsed = employeeWriteSchema.safeParse(rawInput);
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((issue) => issue.message));
      }

      const existingEmployee = Number.isInteger(employeeNumber) ? employeeByNumber.get(employeeNumber) : undefined;
      return {
        rowNumber,
        original: row,
        normalized: parsed.success ? parsed.data : null,
        errors,
        proposedAction: parsed.success ? (existingEmployee ? 'UPDATE' : 'CREATE') : null,
        existingEmployeeId: existingEmployee?.id ?? null,
        selected: errors.length === 0,
      };
    });

    const user = (req as AuthenticatedRequest).authUser;
    const batchData: Prisma.ImportBatchCreateInput = {
      filename: file.originalname,
      actorSub: user.sub,
      actorEmail: user.email ?? null,
      rowCount: previewRows.length,
      rows: {
        create: previewRows.map((row) => {
            const data: Prisma.ImportRowCreateWithoutBatchInput = {
              rowNumber: row.rowNumber,
              original: row.original,
              errors: row.errors,
              existingEmployeeId: row.existingEmployeeId,
              status: row.errors.length > 0 ? 'ERROR' : 'PENDING',
            };
            if (row.normalized) data.normalized = row.normalized as Prisma.InputJsonObject;
            if (row.proposedAction) data.proposedAction = row.proposedAction;
            return data;
          }),
      },
    };

    const batch = await prisma.importBatch.create({ data: batchData });

    res.status(201).json({ data: { batchId: batch.id, rows: previewRows } });
  })
);

adminRouter.post(
  '/imports/:id/commit',
  asyncHandler(async (req, res) => {
    const input = importCommitSchema.parse(req.body);
    const user = (req as AuthenticatedRequest).authUser;
    const id = requestId(req as AuthenticatedRequest);

    const result = await prisma.$transaction(async (tx) => {
      const batchId = pathParam(req, 'id');
      const rows = await tx.importRow.findMany({
        where: {
          batchId,
          rowNumber: { in: input.selectedRows },
          status: 'PENDING',
        },
        orderBy: { rowNumber: 'asc' },
      });
      if (rows.length !== input.selectedRows.length) {
        throw new HttpError(409, 'IMPORT_ROWS_NOT_COMMITTABLE', 'Only valid pending rows can be committed.');
      }

      const parsedRows = rows.map((row) => ({ row, parsed: employeeWriteSchema.parse(row.normalized) }));
      const rowsByEmployeeNumber = new Map<number, number[]>();
      for (const { row, parsed } of parsedRows) {
        const rowNumbers = rowsByEmployeeNumber.get(parsed.employeeNumber) ?? [];
        rowNumbers.push(row.rowNumber);
        rowsByEmployeeNumber.set(parsed.employeeNumber, rowNumbers);
      }
      const duplicate = [...rowsByEmployeeNumber.entries()].find(([, rowNumbers]) => rowNumbers.length > 1);
      if (duplicate) {
        const [employeeNumber, rowNumbers] = duplicate;
        throw new HttpError(
          409,
          'DUPLICATE_IMPORT_EMPLOYEE_NUMBER',
          `Employee Number ${employeeNumber} appears more than once in selected rows (${rowNumbers.join(', ')}).`
        );
      }

      const committed = [];
      for (const { row, parsed } of parsedRows) {
        const before = await tx.employee.findUnique({
          where: { employeeNumber: parsed.employeeNumber },
          include: { department: true },
        });
        const employee = before
          ? await tx.employee.update({
              where: { employeeNumber: parsed.employeeNumber },
              data: toEmployeeData(parsed),
              include: { department: true },
            })
          : await tx.employee.create({
              data: toEmployeeData(parsed),
              include: { department: true },
            });

        await writeAuditLog({
          tx,
          user,
          requestId: id,
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          employeeNumber: employee.employeeNumber,
          action: before ? 'UPDATE' : 'CREATE',
          before: before ? jsonSnapshot(serializeEmployee(before)) : null,
          after: jsonSnapshot(serializeEmployee(employee)),
          importBatchId: batchId,
        });
        const rowUpdate = await tx.importRow.updateMany({
          where: { id: row.id, status: 'PENDING' },
          data: { status: 'COMMITTED' },
        });
        if (rowUpdate.count !== 1) {
          throw new HttpError(409, 'IMPORT_ROW_ALREADY_COMMITTED', 'One or more selected import rows were already committed.');
        }
        committed.push(serializeEmployee(employee));
      }

      await tx.importBatch.update({
        where: { id: batchId },
        data: { committedAt: new Date() },
      });
      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'IMPORT_BATCH',
        entityId: batchId,
        action: 'IMPORT_COMMIT',
        after: jsonSnapshot({ committedRows: committed.length }),
        importBatchId: batchId,
      });

      return committed;
    });

    res.json({ data: { committed: result } });
  })
);
