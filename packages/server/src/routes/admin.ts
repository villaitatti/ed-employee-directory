import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { Router, type Request } from 'express';
import multer from 'multer';
import {
  auditActionSchema,
  calculateRetirementDate,
  departmentCreateSchema,
  employeeListQuerySchema,
  employeeWriteSchema,
  entityTypeSchema,
  importCommitSchema,
  normalizeDepartmentName,
  retirementPolicySchema,
  type ImportPreviewRow,
} from '@itatti/shared';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { AuthenticatedRequest, requireAuth, requireStaff } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { writeAuditLog } from '../services/audit.js';
import {
  csvEscape,
  parseBoolean,
  parseContractType,
  parseNullableDate,
  parseStatus,
  parseTfr,
  parseUsaCategory,
  readFirst,
} from '../services/csv.js';
import { toEmployeeData } from '../services/employee-input.js';
import { serializeAuditLog, serializeDepartment, serializeEmployee } from '../services/serializers.js';
import { getRetirementPolicy, getRetirementSetting, RETIREMENT_POLICY_KEY } from '../services/settings.js';

const CSV_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
]);

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

type UploadRecord = {
  rowNumber: number;
  row: Record<string, string>;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const lowerName = file.originalname.toLowerCase();
    const hasCsvExtension = lowerName.endsWith('.csv');
    const hasExcelExtension = lowerName.endsWith('.xlsx');
    if (
      (hasCsvExtension && CSV_MIME_TYPES.has(file.mimetype)) ||
      (hasExcelExtension && EXCEL_MIME_TYPES.has(file.mimetype))
    ) {
      cb(null, true);
      return;
    }
    cb(new HttpError(400, 'EMPLOYEE_FILE_REQUIRED', 'Upload a .xlsx employee file.'));
  },
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

function dateStringToExcelDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw] = match;
  return new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw)));
}

function displayUsaCategory(value: string): string {
  if (value === 'NON_EXEMPT') return 'Non Exempt';
  if (value === 'OTHER') return 'Other';
  return 'Exempt';
}

function displayContractType(value: string): string {
  if (value === 'DETERMINATO') return 'Determinato';
  if (value === 'CONTRATTO_USA') return 'Contratto USA';
  if (value === 'COLLABORATORE') return 'Collaboratore';
  return 'Indeterminato';
}

function displayTfr(value: string): string {
  return value === 'FONDO_PENSIONE' ? 'Fondo Pensione' : 'I Tatti';
}

function displayStatus(value: string): string {
  if (value === 'CESSATO') return 'Cessato';
  if (value === 'DA_ASSUMERE') return 'Da Assumere';
  return 'Attivo';
}

function formatDateForImport(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function excelValueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDateForImport(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value)) {
    if (typeof value.text === 'string') return value.text.trim();
    if ('result' in value) return excelValueToString(value.result);
    if (Array.isArray(value.richText)) {
      return value.richText
        .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();
    }
  }
  return String(value).trim();
}

async function parseUploadRecords(file: Express.Multer.File): Promise<UploadRecord[]> {
  if (file.originalname.toLowerCase().endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    const workbookBuffer = file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(workbookBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new HttpError(400, 'EMPTY_WORKBOOK', 'The Excel file does not contain a worksheet.');

    const firstRowValues = worksheet.getRow(1).values;
    const headerValues = Array.isArray(firstRowValues) ? firstRowValues.slice(1) : Object.values(firstRowValues);
    const headers = headerValues.map((value: ExcelJS.CellValue) => excelValueToString(value));
    if (headers.length === 0 || headers.every((header) => !header)) {
      throw new HttpError(400, 'MISSING_HEADERS', 'The Excel file must have headers in the first row.');
    }

    const records: UploadRecord[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, string> = {};
      let hasValue = false;
      headers.forEach((header, index) => {
        if (!header) return;
        const value = excelValueToString(row.getCell(index + 1).value);
        if (value) hasValue = true;
        record[header] = value;
      });
      if (hasValue) records.push({ rowNumber, row: record });
    });
    return records;
  }

  const rows = parse(file.buffer, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as Record<string, string>[];
  return rows.map((row, index) => ({ rowNumber: index + 2, row }));
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
    if (/^\d+$/.test(query.q)) {
      terms.push({ employeeNumber: Number(query.q) });
    }
    where.OR = terms;
  }
  return where;
}

adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const setting = await getRetirementSetting(prisma);
    res.json({ data: setting });
  })
);

adminRouter.put(
  '/settings/retirement-policy',
  asyncHandler(async (req, res) => {
    const policy = retirementPolicySchema.parse(req.body);
    const user = (req as AuthenticatedRequest).authUser;
    const id = requestId(req as AuthenticatedRequest);

    const result = await prisma.$transaction(async (tx) => {
      const before = await getRetirementSetting(tx);
      const unchanged =
        before.retirementPolicy.years === policy.years &&
        before.retirementPolicy.months === policy.months;

      const setting = await tx.setting.upsert({
        where: { key: RETIREMENT_POLICY_KEY },
        create: { key: RETIREMENT_POLICY_KEY, value: policy },
        update: { value: policy },
      });

      // Recalculate the projected retirement date for every employee whose date
      // was never manually overridden, so the directory reflects the new law.
      // Overridden dates are intentionally left untouched. Skip the table-wide
      // recalc entirely when the policy didn't actually change — a repeated PUT
      // with the same value shouldn't rescan and relock every employee row.
      const employees = unchanged
        ? []
        : await tx.employee.findMany({
            where: { retirementDateOverridden: false },
            select: { id: true, birthDate: true },
          });
      // Group employees by their recomputed date and issue one updateMany per
      // distinct date instead of one UPDATE per employee. The date math stays in
      // calculateRetirementDate (single source of truth); only the writes are
      // batched, bounding the round-trips held open inside this transaction.
      const idsByRetirementDate = new Map<string, string[]>();
      for (const employee of employees) {
        const birthDate = employee.birthDate.toISOString().slice(0, 10);
        const retirementDate = calculateRetirementDate(birthDate, policy);
        const ids = idsByRetirementDate.get(retirementDate) ?? [];
        ids.push(employee.id);
        idsByRetirementDate.set(retirementDate, ids);
      }
      let recalculated = 0;
      for (const [retirementDate, ids] of idsByRetirementDate) {
        // Re-assert retirementDateOverridden=false in the write predicate: if a
        // concurrent edit confirmed the date between the findMany and here,
        // that row is skipped rather than having its override silently clobbered.
        const updated = await tx.employee.updateMany({
          where: { id: { in: ids }, retirementDateOverridden: false },
          data: { retirementDate: new Date(`${retirementDate}T00:00:00.000Z`) },
        });
        recalculated += updated.count;
      }

      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'SETTING',
        entityId: RETIREMENT_POLICY_KEY,
        action: 'UPDATE',
        before: jsonSnapshot({ retirementPolicy: before.retirementPolicy }),
        after: jsonSnapshot({ retirementPolicy: policy, recalculatedEmployees: recalculated }),
      });

      return {
        retirementPolicy: policy,
        updatedAt: setting.updatedAt.toISOString(),
        recalculatedEmployees: recalculated,
      };
    }, {
      // The bulk recalc can touch every employee; give it headroom beyond the
      // 5s interactive-transaction default.
      timeout: 30_000,
    });

    res.json({ data: result });
  })
);

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
      const policy = await getRetirementPolicy(tx);
      const created = await tx.employee.create({
        data: toEmployeeData(input, undefined, policy),
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
      const policy = await getRetirementPolicy(tx);
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: toEmployeeData(
          input,
          {
            retirementDate: before.retirementDate.toISOString().slice(0, 10),
            retirementDateOverridden: before.retirementDateOverridden,
          },
          policy
        ),
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
        'Retirement Date Confirmed',
        'FTE',
        'USA Category',
        'Contract Type',
        'TFR',
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
          serialized.tfr,
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
  '/employees/export.xlsx',
  asyncHandler(async (req, res) => {
    const query = employeeListQuerySchema.parse(req.query);
    const employees = await prisma.employee.findMany({
      where: employeeWhereFromQuery(query),
      include: { department: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ED Employee Directory';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Employees', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.columns = [
      { header: 'Employee Number', key: 'employeeNumber', width: 18 },
      { header: 'First Name', key: 'firstName', width: 18 },
      { header: 'Last Name', key: 'lastName', width: 18 },
      { header: 'Department', key: 'department', width: 28 },
      { header: 'Birth Date', key: 'birthDate', width: 14 },
      { header: 'Hire Date', key: 'hireDate', width: 14 },
      { header: 'Termination Date', key: 'terminationDate', width: 16 },
      { header: 'Retirement Date', key: 'retirementDate', width: 16 },
      { header: 'Retirement Date Confirmed', key: 'retirementDateOverridden', width: 28 },
      { header: 'FTE', key: 'fte', width: 10 },
      { header: 'USA Category', key: 'usaCategory', width: 16 },
      { header: 'Contract Type', key: 'contractType', width: 18 },
      { header: 'TFR', key: 'tfr', width: 18 },
      { header: 'Status', key: 'status', width: 16 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle' };
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columns.length },
    };

    for (const employee of employees) {
      const serialized = serializeEmployee(employee);
      worksheet.addRow({
        employeeNumber: serialized.employeeNumber,
        firstName: serialized.firstName,
        lastName: serialized.lastName,
        department: serialized.department?.name ?? '',
        birthDate: dateStringToExcelDate(serialized.birthDate),
        hireDate: dateStringToExcelDate(serialized.hireDate),
        terminationDate: dateStringToExcelDate(serialized.terminationDate),
        retirementDate: dateStringToExcelDate(serialized.retirementDate),
        retirementDateOverridden: serialized.retirementDateOverridden,
        fte: serialized.fte,
        usaCategory: displayUsaCategory(serialized.usaCategory),
        contractType: displayContractType(serialized.contractType),
        tfr: displayTfr(serialized.tfr),
        status: displayStatus(serialized.status),
      });
    }

    for (const key of ['birthDate', 'hireDate', 'terminationDate', 'retirementDate']) {
      worksheet.getColumn(key).numFmt = 'dd/mm/yyyy';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', 'attachment; filename="ed-employees.xlsx"');
    res.send(Buffer.from(buffer));
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
    if (typeof req.query.entityType === 'string') {
      const entityType = entityTypeSchema.safeParse(req.query.entityType);
      if (entityType.success) where.entityType = entityType.data;
    }
    if (typeof req.query.action === 'string') {
      const action = auditActionSchema.safeParse(req.query.action);
      if (action.success) where.action = action.data;
    }
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
    if (!file) throw new HttpError(400, 'EMPLOYEE_FILE_REQUIRED', 'Upload an employee file in the file field.');

    const records = await parseUploadRecords(file);

    const [departments, employees] = await Promise.all([
      prisma.department.findMany(),
      prisma.employee.findMany({ select: { id: true, employeeNumber: true } }),
    ]);
    const departmentByName = new Map(departments.map((department) => [department.normalizedName, department]));
    const employeeByNumber = new Map(employees.map((employee) => [employee.employeeNumber, employee]));
    const employeeNumberRows = new Map<number, number[]>();
    for (const { row, rowNumber } of records) {
      const employeeNumber = Number(readFirst(row, ['numero matricola', 'employee number', 'employee id']));
      if (Number.isInteger(employeeNumber) && employeeNumber > 0) {
        const rowNumbers = employeeNumberRows.get(employeeNumber) ?? [];
        rowNumbers.push(rowNumber);
        employeeNumberRows.set(employeeNumber, rowNumbers);
      }
    }

    const previewRows: ImportPreviewRow[] = records.map(({ row, rowNumber }) => {
      const departmentName = readFirst(row, ['dipartimento', 'department']);
      const department = departmentByName.get(normalizeDepartmentName(departmentName));
      const employeeNumber = Number(readFirst(row, ['numero matricola', 'employee number', 'employee id']));
      const errors: string[] = [];

      if (!departmentName) errors.push('Department is required.');
      if (departmentName && !department) errors.push(`Unknown department: ${departmentName}.`);
      if (!Number.isInteger(employeeNumber) || employeeNumber <= 0) errors.push('Employee Number must be a positive integer.');
      const duplicateRows = employeeNumberRows.get(employeeNumber) ?? [];
      if (duplicateRows.length > 1) {
        errors.push(`Employee Number ${employeeNumber} appears more than once in this file (rows ${duplicateRows.join(', ')}).`);
      }

      // Honor the "Retirement Date Confirmed" flag (the same column export
      // emits). When true, the imported retirement date is an approved date and
      // is passed through. When false/absent, recalculate from the
      // current policy instead of freezing the imported (possibly stale) date —
      // otherwise an export → policy-change → re-import would silently turn every
      // calculated date into a bogus confirmed date.
      const retirementOverridden = parseBoolean(
        readFirst(row, [
          'data pensionamento confermata',
          'data pensionamento manuale',
          'retirement date confirmed',
          'retirement date overridden',
          'retirementdateconfirmed',
          'retirementdateoverridden',
        ])
      );
      const importedRetirementDate = parseNullableDate(
        readFirst(row, ['data pensionamento', 'retirement date', 'retirementdate'])
      );
      const rawInput = {
        employeeNumber,
        firstName: readFirst(row, ['nome', 'first name', 'firstname']),
        lastName: readFirst(row, ['cognome', 'last name', 'lastname']),
        departmentId: department?.id ?? '',
        birthDate: parseNullableDate(readFirst(row, ['data di nascita', 'birth date', 'birthdate'])),
        hireDate: parseNullableDate(readFirst(row, ['data assunzione', 'hire date', 'hiredate'])),
        terminationDate: parseNullableDate(readFirst(row, ['data cessazione', 'termination date', 'terminationdate'])),
        retirementDate: retirementOverridden ? importedRetirementDate : null,
        resetRetirementDate: !retirementOverridden,
        retirementDateOverridden: retirementOverridden,
        fte: readFirst(row, ['fte']),
        usaCategory: parseUsaCategory(readFirst(row, ['categoria usa', 'usa category'])),
        contractType: parseContractType(readFirst(row, ['tipo contratto', 'contract type'])),
        tfr: parseTfr(readFirst(row, ['tfr'])),
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
      const policy = await getRetirementPolicy(tx);
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

        // The preview recorded CREATE vs UPDATE. If the world changed between
        // preview and commit (a concurrent insert/delete of this employeeNumber),
        // the previewed action no longer matches reality — refuse rather than
        // silently overwriting a record the operator never reviewed.
        const liveAction = before ? 'UPDATE' : 'CREATE';
        if (row.proposedAction && row.proposedAction !== liveAction) {
          throw new HttpError(
            409,
            'IMPORT_ACTION_DRIFT',
            `Employee Number ${parsed.employeeNumber} changed since preview (previewed ${row.proposedAction}, now ${liveAction}). Re-run the import preview.`
          );
        }

        const employee = before
          ? await tx.employee.update({
              where: { employeeNumber: parsed.employeeNumber },
              data: toEmployeeData(
                parsed,
                {
                  retirementDate: before.retirementDate.toISOString().slice(0, 10),
                  retirementDateOverridden: before.retirementDateOverridden,
                },
                policy
              ),
              include: { department: true },
            })
          : await tx.employee.create({
              data: toEmployeeData(parsed, undefined, policy),
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
