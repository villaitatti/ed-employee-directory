import { Prisma } from '@prisma/client';
import type { ApprovalRole as ApprovalRoleValue } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { Router, type Request } from 'express';
import multer from 'multer';
import {
  auditActionSchema,
  calculateRetirementDate,
  departmentCreateSchema,
  employeeApprovalRoleNumbersSchema,
  employeeListQuerySchema,
  employeeWriteSchema,
  entityTypeSchema,
  importCommitSchema,
  isValidEmployeeNumber,
  normalizeDepartmentName,
  retirementPolicySchema,
  WEEKDAY_KEYS,
  type EmployeeApprovalRoleIds,
  type EmployeeApprovalRoleNumbers,
  type EmployeeWriteInput,
  type ImportPreviewRow,
  type WeekdayKey,
} from '@itatti/shared';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { AuthenticatedRequest, requireAuth, requireStaff } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { writeAuditLog } from '../services/audit.js';
import {
  csvEscape,
  normalizeHeader,
  parseEmployeeNumberList,
  parseBoolean,
  parseContractType,
  parseNullableDate,
  parseOptionalBoolean,
  parseStatus,
  parseTfr,
  parseUsaCategory,
  readFirst,
} from '../services/csv.js';
import { toEmployeeData } from '../services/employee-input.js';
import { serializeAuditLog, serializeDepartment, serializeEmployee } from '../services/serializers.js';
import { getRetirementPolicy, getRetirementSetting, RETIREMENT_POLICY_KEY } from '../services/settings.js';
import {
  approvalRoleEntries,
  employeeDetailsInclude,
  emptyApprovalRoleIds,
  existingApprovalRoleIds,
  assertEmployeeHasNoApprovalReferences,
  findApprovalReferenceEmployeeNumbers,
  missingRequiredApprovers,
  REQUIRED_APPROVER_MESSAGES,
  replaceApprovalAssignments,
  roleApproverKey,
  validateApprovalRoleIds,
  validateEmployeeCanLoseApprovalEligibility,
  weeklyScheduleFromEmployee,
  type EmployeeDetails,
} from '../services/approvals.js';

// Upper bound on rows accepted per import file. The preview runs an O(rows²)
// reference fixpoint plus per-row DB lookups, so an unbounded upload is a DoS
// surface even for authenticated staff. The org has a few hundred employees;
// this is comfortably above any real payroll file.
const MAX_IMPORT_ROWS = 2000;

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

// Cap the client-supplied correlation id so a caller can't persist multi-KB
// junk into every audit row. Anything absent or over the limit gets a fresh
// server-generated UUID instead.
const MAX_REQUEST_ID_LENGTH = 200;

function requestId(req: AuthenticatedRequest): string {
  const header = req.headers['x-request-id'];
  const raw = typeof header === 'string' ? header : Array.isArray(header) ? header[0] : undefined;
  if (raw && raw.length > 0 && raw.length <= MAX_REQUEST_ID_LENGTH) return raw;
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

function hasHeader(row: Record<string, string>, aliases: string[]): boolean {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return Object.keys(row).some((key) => normalizedAliases.has(normalizeHeader(key)));
}

const preApproverAliases = [
  'responsabile pre approvatore',
  'pre approvatore',
  'pre approver',
  'preapprover',
];
const responsabileAliases = ['responsabile', 'approver'];
const retirementDateAliases = ['data pensionamento', 'retirement date', 'retirementdate'];
const retirementConfirmedAliases = [
  'data pensionamento confermata',
  'data pensionamento manuale',
  'retirement date confirmed',
  'retirement date overridden',
  'retirementdateconfirmed',
  'retirementdateoverridden',
];
const substituteResponsabileAliases = [
  'sostituto responsabile',
  'sostituto responsabile employee number',
  'substitute responsabile',
  'substitute approver',
];
const weekdayAliases = {
  monday: ['lu', 'lunedi', 'monday'],
  tuesday: ['ma', 'martedi', 'tuesday'],
  wednesday: ['me', 'mercoledi', 'wednesday'],
  thursday: ['gio', 'giovedi', 'thursday'],
  friday: ['ve', 'venerdi', 'friday'],
} as const;

function parseRoleNumbers(row: Record<string, string>): {
  roleNumbers: EmployeeApprovalRoleNumbers | undefined;
  errors: string[];
} {
  const hasRoleColumns =
    hasHeader(row, preApproverAliases) ||
    hasHeader(row, responsabileAliases) ||
    hasHeader(row, substituteResponsabileAliases);
  if (!hasRoleColumns) return { roleNumbers: undefined, errors: [] };

  const preApprovers = parseEmployeeNumberList(readFirst(row, preApproverAliases));
  const responsabili = parseEmployeeNumberList(readFirst(row, responsabileAliases));
  const substitutes = parseEmployeeNumberList(readFirst(row, substituteResponsabileAliases));
  return {
    roleNumbers: {
      preApproverNumbers: preApprovers.values,
      responsabileNumbers: responsabili.values,
      substituteResponsabileNumbers: substitutes.values,
    },
    errors: [...preApprovers.errors, ...responsabili.errors, ...substitutes.errors],
  };
}

function parseWeeklyScheduleFromRow(row: Record<string, string>): Partial<Record<WeekdayKey, string>> | undefined {
  const hasWeeklyColumns = Object.values(weekdayAliases).some((aliases) => hasHeader(row, [...aliases]));
  if (!hasWeeklyColumns) return undefined;
  // Only include days whose cell is non-blank. Blank/missing day columns are
  // omitted so the schema's per-field default (full-time 7,30) applies, rather
  // than feeding '' to the sessantesimi parser and rejecting the whole row.
  const schedule: Partial<Record<WeekdayKey, string>> = {};
  for (const key of WEEKDAY_KEYS) {
    const value = readFirst(row, [...weekdayAliases[key]]);
    if (value) schedule[key] = value;
  }
  return schedule;
}

type ApprovalCandidate = {
  id: string | null;
  employeeNumber: number;
  firstName: string;
  lastName: string;
  status: EmployeeWriteInput['status'];
  canBeResponsible: boolean;
  canBeSubstituteResponsible: boolean;
};

function candidateName(candidate: ApprovalCandidate): string {
  return `${candidate.firstName} ${candidate.lastName}`.trim() || `Employee Number ${candidate.employeeNumber}`;
}

function validateRoleNumberCandidates(input: {
  employeeNumber: number;
  status: EmployeeWriteInput['status'];
  roleNumbers: EmployeeApprovalRoleNumbers;
  candidateByNumber: Map<number, ApprovalCandidate>;
  /** Employee Numbers that appear as a subject row anywhere in this import. */
  inFileEmployeeNumbers: ReadonlySet<number>;
  /** Subject rows currently considered valid+selected in this iteration. */
  selectedImportNumbers: ReadonlySet<number>;
  errors: string[];
}): void {
  const candidates = [...input.candidateByNumber.values()];
  const eligibleExists = (predicate: (candidate: ApprovalCandidate) => boolean): boolean =>
    candidates.some(
      (candidate) => candidate.status === 'ATTIVO' && candidate.employeeNumber !== input.employeeNumber && predicate(candidate)
    );
  for (const code of missingRequiredApprovers(input.status, {
    hasResponsabile: input.roleNumbers.responsabileNumbers.length > 0,
    hasSubstitute: input.roleNumbers.substituteResponsabileNumbers.length > 0,
    responsabileEligibleExists: eligibleExists((candidate) => candidate.canBeResponsible),
    substituteEligibleExists: eligibleExists((candidate) => candidate.canBeSubstituteResponsible),
  })) {
    input.errors.push(REQUIRED_APPROVER_MESSAGES[code]);
  }

  for (const { employeeNumber, role } of roleNumberEntries(input.roleNumbers)) {
    if (employeeNumber === input.employeeNumber) {
      input.errors.push('Employees cannot approve themselves.');
      continue;
    }
    // When the operator includes the approver as its own row in this file, that
    // pending row is authoritative — the reference is only valid if that row is
    // itself valid and selected. This holds even when the approver also exists
    // in the DB, so a reference can't quietly fall back to stale DB state for a
    // row the operator chose not to apply. Feeding this into the fixpoint also
    // propagates transitively (A→B→invalid C invalidates both B and A).
    if (input.inFileEmployeeNumbers.has(employeeNumber) && !input.selectedImportNumbers.has(employeeNumber)) {
      input.errors.push(`Approver Employee Number ${employeeNumber} is not a valid row in this import.`);
      continue;
    }
    const candidate = input.candidateByNumber.get(employeeNumber);
    if (!candidate) {
      input.errors.push(`Unknown approver Employee Number: ${employeeNumber}.`);
      continue;
    }
    if (candidate.status !== 'ATTIVO') {
      input.errors.push(`${candidateName(candidate)} is not an active employee.`);
    }
    if (role === 'RESPONSABILE' && !candidate.canBeResponsible) {
      input.errors.push(`${candidateName(candidate)} is not marked as Responsabile eligible.`);
    }
    if (role === 'SUBSTITUTE_RESPONSABILE' && !candidate.canBeSubstituteResponsible) {
      input.errors.push(`${candidateName(candidate)} is not marked as Sostituto-Responsabile eligible.`);
    }
  }
}

function approvalRoleIdsFromNumbers(
  roleNumbers: EmployeeApprovalRoleNumbers | undefined,
  employeeByNumber: Map<number, { id: string }>
): EmployeeApprovalRoleIds | undefined {
  if (!roleNumbers) return undefined;
  return {
    preApproverIds: roleNumbers.preApproverNumbers.map((employeeNumber) => employeeByNumber.get(employeeNumber)?.id ?? ''),
    responsabileIds: roleNumbers.responsabileNumbers.map((employeeNumber) => employeeByNumber.get(employeeNumber)?.id ?? ''),
    substituteResponsabileIds: roleNumbers.substituteResponsabileNumbers.map(
      (employeeNumber) => employeeByNumber.get(employeeNumber)?.id ?? ''
    ),
  };
}

function roleNumbersFromNormalized(value: unknown): EmployeeApprovalRoleNumbers | undefined {
  if (!isRecord(value) || !('approvalRoleEmployeeNumbers' in value)) return undefined;
  return employeeApprovalRoleNumbersSchema.parse(value.approvalRoleEmployeeNumbers);
}

function allApprovalRoleNumbers(roleNumbers: EmployeeApprovalRoleNumbers | undefined): number[] {
  return [
    ...(roleNumbers?.preApproverNumbers ?? []),
    ...(roleNumbers?.responsabileNumbers ?? []),
    ...(roleNumbers?.substituteResponsabileNumbers ?? []),
  ];
}

/** Maps each number-list field on EmployeeApprovalRoleNumbers to its ApprovalRole. */
const ROLE_NUMBER_FIELDS = [
  ['preApproverNumbers', 'PRE_APPROVER'],
  ['responsabileNumbers', 'RESPONSABILE'],
  ['substituteResponsabileNumbers', 'SUBSTITUTE_RESPONSABILE'],
] as const;

/** Flattens the three number arrays into tagged {employeeNumber, role} entries. */
function roleNumberEntries(
  roleNumbers: EmployeeApprovalRoleNumbers
): Array<{ employeeNumber: number; role: ApprovalRoleValue }> {
  return ROLE_NUMBER_FIELDS.flatMap(([field, role]) =>
    roleNumbers[field].map((employeeNumber) => ({ employeeNumber, role }))
  );
}

function roleNumbersForExport(employee: EmployeeDetails, role: EmployeeDetails['approvalAssignments'][number]['role']): string {
  return employee.approvalAssignments
    .filter((assignment) => assignment.role === role)
    .map((assignment) => assignment.approver.employeeNumber)
    .sort((left, right) => left - right)
    .join('; ');
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
      const asNumber = Number(query.q);
      // Skip the employeeNumber term when the query is too large for the int4
      // column; the name terms still apply. Feeding it to Prisma would 500.
      if (isValidEmployeeNumber(asNumber)) {
        terms.push({ employeeNumber: asNumber });
      }
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

      // A no-op save: don't bump the Setting row's updatedAt or write a bogus
      // "UPDATE ... recalculatedEmployees: 0" audit entry for a policy that
      // didn't actually change.
      if (unchanged) {
        return {
          retirementPolicy: before.retirementPolicy,
          updatedAt: before.updatedAt,
          recalculatedEmployees: 0,
        };
      }

      const setting = await tx.setting.upsert({
        where: { key: RETIREMENT_POLICY_KEY },
        create: { key: RETIREMENT_POLICY_KEY, value: policy },
        update: { value: policy },
      });

      // Recalculate the projected retirement date for every employee whose date
      // was never manually overridden, so the directory reflects the new law.
      // Overridden dates are intentionally left untouched.
      const employees = await tx.employee.findMany({
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
  '/employee-options',
  asyncHandler(async (req, res) => {
    const substituteEligible = req.query.substituteEligible === 'true';
    const employees = await prisma.employee.findMany({
      where: {
        status: 'ATTIVO',
        ...(substituteEligible ? { canBeSubstituteResponsible: true } : {}),
      },
      include: { department: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { employeeNumber: 'asc' }],
    });
    res.json({
      data: employees.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        status: employee.status,
        department: serializeDepartment(employee.department),
        canBeResponsible: employee.canBeResponsible,
        canBeSubstituteResponsible: employee.canBeSubstituteResponsible,
      })),
    });
  })
);

adminRouter.get(
  '/employees',
  asyncHandler(async (req, res) => {
    const query = employeeListQuerySchema.parse(req.query);
    const employees = await prisma.employee.findMany({
      where: employeeWhereFromQuery(query),
      include: employeeDetailsInclude,
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
      const roleIds = input.approvalRoleIds ?? emptyApprovalRoleIds();
      await validateApprovalRoleIds(tx, {
        roleIds,
        employeeNumber: input.employeeNumber,
        status: input.status,
      });
      const created = await tx.employee.create({
        data: toEmployeeData(input, undefined, policy),
      });
      await replaceApprovalAssignments(tx, created.id, roleIds);
      const createdWithDetails = await tx.employee.findUniqueOrThrow({
        where: { id: created.id },
        include: employeeDetailsInclude,
      });
      await writeAuditLog({
        tx,
        user,
        requestId: id,
        entityType: 'EMPLOYEE',
        entityId: createdWithDetails.id,
        employeeNumber: createdWithDetails.employeeNumber,
        action: 'CREATE',
        after: jsonSnapshot(serializeEmployee(createdWithDetails)),
      });
      return createdWithDetails;
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
      const before = await tx.employee.findUnique({ where: { id: employeeId }, include: employeeDetailsInclude });
      if (!before) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
      const policy = await getRetirementPolicy(tx);
      const existingRoleIds = await existingApprovalRoleIds(tx, employeeId);
      const roleIds = input.approvalRoleIds ?? existingRoleIds;
      // Approvers already assigned to this employee are grandfathered per (role,
      // approver): they were valid when set, so re-saving (or editing an
      // unrelated field) must not fail because another employee's record changed
      // in the meantime. Newly added approvers — including an existing approver
      // added to a new role — are still fully validated.
      const grandfatheredApprovers = new Set(
        approvalRoleEntries(existingRoleIds).map(({ id, role }) => roleApproverKey(role, id))
      );
      await validateApprovalRoleIds(tx, {
        roleIds,
        employeeNumber: input.employeeNumber,
        status: input.status,
        currentEmployeeId: employeeId,
        grandfatheredApprovers,
      });
      await validateEmployeeCanLoseApprovalEligibility(tx, {
        employeeId,
        currentStatus: before.status,
        nextStatus: input.status,
        currentCanBeResponsible: before.canBeResponsible,
        nextCanBeResponsible: input.canBeResponsible ?? before.canBeResponsible,
        currentCanBeSubstituteResponsible: before.canBeSubstituteResponsible,
        nextCanBeSubstituteResponsible: input.canBeSubstituteResponsible ?? before.canBeSubstituteResponsible,
      });
      await tx.employee.update({
        where: { id: employeeId },
        data: toEmployeeData(
          input,
          {
            retirementDate: before.retirementDate.toISOString().slice(0, 10),
            retirementDateOverridden: before.retirementDateOverridden,
            tfr: before.tfr,
            canBeResponsible: before.canBeResponsible,
            canBeSubstituteResponsible: before.canBeSubstituteResponsible,
            weeklySchedule: weeklyScheduleFromEmployee(before),
          },
          policy
        ),
      });
      if (input.approvalRoleIds) {
        await replaceApprovalAssignments(tx, employeeId, input.approvalRoleIds);
      }
      const updated = await tx.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: employeeDetailsInclude,
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
      const before = await tx.employee.findUnique({ where: { id: employeeId }, include: employeeDetailsInclude });
      if (!before) throw new HttpError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
      await assertEmployeeHasNoApprovalReferences(tx, {
        approverId: employeeId,
        code: 'APPROVER_IN_USE',
        message: (employeeNumbers) =>
          `This employee is used in approval workflows by Employee Numbers ${employeeNumbers}. Remove those approval assignments before deleting the employee.`,
      });
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
      include: employeeDetailsInclude,
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
        'Responsabile Abilitato',
        'Sostituto Abilitato',
        'Responsabile Pre-approvatore',
        'Responsabile',
        'Sostituto-Responsabile',
        'LU',
        'MA',
        'ME',
        'GIO',
        'VE',
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
          serialized.canBeResponsible,
          serialized.canBeSubstituteResponsible,
          roleNumbersForExport(employee, 'PRE_APPROVER'),
          roleNumbersForExport(employee, 'RESPONSABILE'),
          roleNumbersForExport(employee, 'SUBSTITUTE_RESPONSABILE'),
          serialized.weeklySchedule.monday.display,
          serialized.weeklySchedule.tuesday.display,
          serialized.weeklySchedule.wednesday.display,
          serialized.weeklySchedule.thursday.display,
          serialized.weeklySchedule.friday.display,
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
      include: employeeDetailsInclude,
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
      { header: 'Responsabile Abilitato', key: 'canBeResponsible', width: 20 },
      { header: 'Sostituto Abilitato', key: 'canBeSubstituteResponsible', width: 20 },
      { header: 'Responsabile Pre-approvatore', key: 'preApprovers', width: 30 },
      { header: 'Responsabile', key: 'responsabili', width: 24 },
      { header: 'Sostituto-Responsabile', key: 'substituteResponsabili', width: 26 },
      { header: 'LU', key: 'monday', width: 10 },
      { header: 'MA', key: 'tuesday', width: 10 },
      { header: 'ME', key: 'wednesday', width: 10 },
      { header: 'GIO', key: 'thursday', width: 10 },
      { header: 'VE', key: 'friday', width: 10 },
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
        canBeResponsible: serialized.canBeResponsible,
        canBeSubstituteResponsible: serialized.canBeSubstituteResponsible,
        preApprovers: roleNumbersForExport(employee, 'PRE_APPROVER'),
        responsabili: roleNumbersForExport(employee, 'RESPONSABILE'),
        substituteResponsabili: roleNumbersForExport(employee, 'SUBSTITUTE_RESPONSABILE'),
        monday: serialized.weeklySchedule.monday.display,
        tuesday: serialized.weeklySchedule.tuesday.display,
        wednesday: serialized.weeklySchedule.wednesday.display,
        thursday: serialized.weeklySchedule.thursday.display,
        friday: serialized.weeklySchedule.friday.display,
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
    if (typeof employeeNumber === 'number' && isValidEmployeeNumber(employeeNumber)) {
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
    if (records.length > MAX_IMPORT_ROWS) {
      throw new HttpError(
        400,
        'IMPORT_TOO_MANY_ROWS',
        `The import file has ${records.length} rows; the maximum is ${MAX_IMPORT_ROWS}.`
      );
    }

    const [departments, employees, existingAssignments] = await Promise.all([
      prisma.department.findMany(),
      prisma.employee.findMany({
        select: {
          id: true,
          employeeNumber: true,
          firstName: true,
          lastName: true,
          status: true,
          canBeResponsible: true,
          canBeSubstituteResponsible: true,
        },
      }),
      prisma.employeeApprovalAssignment.findMany({ select: { employeeId: true, role: true } }),
    ]);
    const departmentByName = new Map(departments.map((department) => [department.normalizedName, department]));
    const employeeByNumber = new Map(employees.map((employee) => [employee.employeeNumber, employee]));
    // Role coverage each existing employee already has, so a re-import that
    // omits the role columns preserves (rather than re-demands) their approvers.
    const existingRolesByEmployeeId = new Map<string, Set<ApprovalRoleValue>>();
    for (const assignment of existingAssignments) {
      const roles = existingRolesByEmployeeId.get(assignment.employeeId) ?? new Set<ApprovalRoleValue>();
      roles.add(assignment.role);
      existingRolesByEmployeeId.set(assignment.employeeId, roles);
    }
    const employeeNumberRows = new Map<number, number[]>();
    for (const { row, rowNumber } of records) {
      const employeeNumber = Number(readFirst(row, ['numero matricola', 'employee number', 'employee id']));
      if (Number.isInteger(employeeNumber) && employeeNumber > 0) {
        const rowNumbers = employeeNumberRows.get(employeeNumber) ?? [];
        rowNumbers.push(rowNumber);
        employeeNumberRows.set(employeeNumber, rowNumbers);
      }
    }

    const parsedRows = records.map(({ row, rowNumber }) => {
      const departmentName = readFirst(row, ['dipartimento', 'department']);
      const department = departmentByName.get(normalizeDepartmentName(departmentName));
      const employeeNumber = Number(readFirst(row, ['numero matricola', 'employee number', 'employee id']));
      const errors: string[] = [];
      const { roleNumbers, errors: roleNumberErrors } = parseRoleNumbers(row);
      errors.push(...roleNumberErrors);

      if (!departmentName) errors.push('Department is required.');
      if (departmentName && !department) errors.push(`Unknown department: ${departmentName}.`);
      if (!Number.isInteger(employeeNumber) || employeeNumber <= 0) errors.push('Employee Number must be a positive integer.');
      const duplicateRows = employeeNumberRows.get(employeeNumber) ?? [];
      if (duplicateRows.length > 1) {
        errors.push(`Employee Number ${employeeNumber} appears more than once in this file (rows ${duplicateRows.join(', ')}).`);
      }

      // Honor the "Retirement Date Confirmed" flag (the same column export
      // emits) — but ONLY when the file actually carries retirement columns.
      // When true, the imported retirement date is an approved date and is
      // passed through. When present-but-false, recalculate from the current
      // policy instead of freezing the imported (possibly stale) date. When the
      // columns are absent entirely (e.g. a names-only partial import), omit the
      // retirement fields so a previously-confirmed government date is preserved
      // rather than reset — this matches resolveRetirementDate's contract.
      const hasRetirementColumns =
        hasHeader(row, retirementDateAliases) || hasHeader(row, retirementConfirmedAliases);
      const retirementOverridden = parseBoolean(readFirst(row, retirementConfirmedAliases));
      const importedRetirementDate = parseNullableDate(readFirst(row, retirementDateAliases));
      const parsedTfr = parseTfr(readFirst(row, ['tfr']));
      const canBeResponsible = parseOptionalBoolean(
        readFirst(row, ['responsabile abilitato', 'puo essere responsabile', 'can be responsible'])
      );
      const canBeSubstituteResponsible = parseOptionalBoolean(
        readFirst(row, ['sostituto abilitato', 'puo essere sostituto responsabile', 'can be substitute responsible'])
      );
      const weeklySchedule = parseWeeklyScheduleFromRow(row);
      const rawInput = {
        employeeNumber,
        firstName: readFirst(row, ['nome', 'first name', 'firstname']),
        lastName: readFirst(row, ['cognome', 'last name', 'lastname']),
        departmentId: department?.id ?? '',
        birthDate: parseNullableDate(readFirst(row, ['data di nascita', 'birth date', 'birthdate'])),
        hireDate: parseNullableDate(readFirst(row, ['data assunzione', 'hire date', 'hiredate'])),
        terminationDate: parseNullableDate(readFirst(row, ['data cessazione', 'termination date', 'terminationdate'])),
        ...(hasRetirementColumns
          ? {
              retirementDate: retirementOverridden ? importedRetirementDate : null,
              resetRetirementDate: !retirementOverridden,
              retirementDateOverridden: retirementOverridden,
            }
          : {}),
        fte: readFirst(row, ['fte']),
        usaCategory: parseUsaCategory(readFirst(row, ['categoria usa', 'usa category'])),
        contractType: parseContractType(readFirst(row, ['tipo contratto', 'contract type'])),
        ...(parsedTfr !== undefined ? { tfr: parsedTfr } : {}),
        status: parseStatus(readFirst(row, ['stato', 'status'])),
        ...(canBeResponsible !== undefined ? { canBeResponsible } : {}),
        ...(canBeSubstituteResponsible !== undefined ? { canBeSubstituteResponsible } : {}),
        ...(weeklySchedule ? { weeklySchedule } : {}),
      };

      const parsed = employeeWriteSchema.safeParse(rawInput);
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((issue) => issue.message));
      }

      const existingEmployee = Number.isInteger(employeeNumber) ? employeeByNumber.get(employeeNumber) : undefined;
      const proposedAction =
        parsed.success && errors.length === 0 ? (existingEmployee ? ('UPDATE' as const) : ('CREATE' as const)) : null;
      return {
        rowNumber,
        original: row,
        employeeNumber,
        parsed: parsed.success ? parsed.data : null,
        roleNumbers,
        baseErrors: errors,
        proposedAction,
        existingEmployeeId: existingEmployee?.id ?? null,
      };
    });

    // Every Employee Number that appears as a subject row in this file (even
    // ones that fail to parse), so references to a same-file row are judged
    // against that pending row rather than silently falling back to DB state.
    const inFileEmployeeNumbers = new Set(
      parsedRows
        .map((row) => row.employeeNumber)
        .filter((employeeNumber): employeeNumber is number => Number.isInteger(employeeNumber) && employeeNumber > 0)
    );

    // Base candidate map of all existing DB employees, built once. Each
    // iteration overlays only the in-file rows currently considered selected;
    // we restore the overlaid entries afterwards so the base can be reused.
    const candidateByNumber = new Map<number, ApprovalCandidate>();
    for (const employee of employees) {
      candidateByNumber.set(employee.employeeNumber, {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        status: employee.status,
        canBeResponsible: employee.canBeResponsible,
        canBeSubstituteResponsible: employee.canBeSubstituteResponsible,
      });
    }

    let selectedImportNumbers = new Set(
      parsedRows
        .filter((row) => row.parsed && row.baseErrors.length === 0)
        .map((row) => row.parsed?.employeeNumber)
        .filter((employeeNumber): employeeNumber is number => typeof employeeNumber === 'number')
    );
    let previewRows: ImportPreviewRow[] = [];
    for (let iteration = 0; iteration <= parsedRows.length; iteration += 1) {
      const overlaid: number[] = [];
      for (const row of parsedRows) {
        if (!row.parsed || !selectedImportNumbers.has(row.parsed.employeeNumber)) continue;
        const existingEmployee = employeeByNumber.get(row.parsed.employeeNumber);
        candidateByNumber.set(row.parsed.employeeNumber, {
          id: existingEmployee?.id ?? null,
          employeeNumber: row.parsed.employeeNumber,
          firstName: row.parsed.firstName,
          lastName: row.parsed.lastName,
          status: row.parsed.status,
          canBeResponsible: row.parsed.canBeResponsible ?? existingEmployee?.canBeResponsible ?? false,
          canBeSubstituteResponsible:
            row.parsed.canBeSubstituteResponsible ?? existingEmployee?.canBeSubstituteResponsible ?? false,
        });
        overlaid.push(row.parsed.employeeNumber);
      }

      previewRows = parsedRows.map((row) => {
        const errors = [...row.baseErrors];
        if (row.parsed && row.roleNumbers) {
          validateRoleNumberCandidates({
            employeeNumber: row.parsed.employeeNumber,
            status: row.parsed.status,
            roleNumbers: row.roleNumbers,
            candidateByNumber,
            inFileEmployeeNumbers,
            selectedImportNumbers,
            errors,
          });
        } else if (row.parsed) {
          // No role columns in the file: the employee keeps whatever approvers
          // they already have. Only a brand-new employee (no existing coverage)
          // can be missing required approvers here.
          const existingId = row.existingEmployeeId;
          const existingRoles = existingId ? existingRolesByEmployeeId.get(existingId) : undefined;
          const subjectNumber = row.parsed.employeeNumber;
          const anyEligible = (predicate: (candidate: ApprovalCandidate) => boolean): boolean =>
            [...candidateByNumber.values()].some(
              (candidate) => candidate.status === 'ATTIVO' && candidate.employeeNumber !== subjectNumber && predicate(candidate)
            );
          for (const code of missingRequiredApprovers(row.parsed.status, {
            hasResponsabile: existingRoles?.has('RESPONSABILE') ?? false,
            hasSubstitute: existingRoles?.has('SUBSTITUTE_RESPONSABILE') ?? false,
            responsabileEligibleExists: anyEligible((candidate) => candidate.canBeResponsible),
            substituteEligibleExists: anyEligible((candidate) => candidate.canBeSubstituteResponsible),
          })) {
            errors.push(REQUIRED_APPROVER_MESSAGES[code]);
          }
        }

        const normalized = row.parsed
          ? {
              ...row.parsed,
              ...(row.roleNumbers ? { approvalRoleEmployeeNumbers: row.roleNumbers } : {}),
            }
          : null;
        return {
          rowNumber: row.rowNumber,
          original: row.original,
          normalized,
          errors,
          proposedAction: row.parsed && errors.length === 0 ? row.proposedAction : null,
          existingEmployeeId: row.existingEmployeeId,
          selected: errors.length === 0,
        };
      });

      // Restore the base map for the next iteration (drop in-file overlays).
      for (const employeeNumber of overlaid) {
        const existingEmployee = employeeByNumber.get(employeeNumber);
        if (existingEmployee) {
          candidateByNumber.set(employeeNumber, {
            id: existingEmployee.id,
            employeeNumber: existingEmployee.employeeNumber,
            firstName: existingEmployee.firstName,
            lastName: existingEmployee.lastName,
            status: existingEmployee.status,
            canBeResponsible: existingEmployee.canBeResponsible,
            canBeSubstituteResponsible: existingEmployee.canBeSubstituteResponsible,
          });
        } else {
          candidateByNumber.delete(employeeNumber);
        }
      }

      const nextSelectedImportNumbers = new Set(
        previewRows
          .filter((row) => row.selected)
          .map((row) => row.normalized?.employeeNumber)
          .filter((employeeNumber): employeeNumber is number => typeof employeeNumber === 'number')
      );
      const unchanged =
        nextSelectedImportNumbers.size === selectedImportNumbers.size &&
        [...nextSelectedImportNumbers].every((employeeNumber) => selectedImportNumbers.has(employeeNumber));
      selectedImportNumbers = nextSelectedImportNumbers;
      if (unchanged) break;
    }

    // Mirror the commit-time eligibility-loss guard at preview time: a row that
    // inactivates an existing approver, or disables their substitute
    // eligibility, while they remain referenced by an employee the import will
    // NOT rewrite, would abort the whole commit transaction. Surface it as a
    // per-row error here so the operator can deselect it instead.
    //
    // Subjects that this import authoritatively rewrites (selected rows that
    // carry role columns) are excluded from the DB reference scan; their
    // post-import references are recomputed from the file instead.
    const rewrittenSubjectNumbers = new Set(
      parsedRows
        .filter((row) => row.parsed && row.roleNumbers && selectedImportNumbers.has(row.parsed.employeeNumber))
        .map((row) => row.parsed?.employeeNumber)
        .filter((employeeNumber): employeeNumber is number => typeof employeeNumber === 'number')
    );
    // approverNumber -> roles still referencing it from the rewritten in-file rows.
    const reaffirmedRoles = new Map<number, Set<ApprovalRoleValue>>();
    for (const row of parsedRows) {
      if (!row.parsed || !row.roleNumbers || !selectedImportNumbers.has(row.parsed.employeeNumber)) continue;
      for (const { employeeNumber, role } of roleNumberEntries(row.roleNumbers)) {
        const roles = reaffirmedRoles.get(employeeNumber) ?? new Set<ApprovalRoleValue>();
        roles.add(role);
        reaffirmedRoles.set(employeeNumber, roles);
      }
    }

    for (const row of previewRows) {
      if (!row.selected || !row.existingEmployeeId) continue;
      const parsed = row.normalized;
      const existing = typeof parsed?.employeeNumber === 'number' ? employeeByNumber.get(parsed.employeeNumber) : undefined;
      if (!parsed || !existing) continue;
      const nextStatus = parsed.status ?? existing.status;
      const nextCanBeResponsible = parsed.canBeResponsible ?? existing.canBeResponsible;
      const nextCanBeSubstitute = parsed.canBeSubstituteResponsible ?? existing.canBeSubstituteResponsible;
      const employeeNumber = existing.employeeNumber;

      if (existing.status === 'ATTIVO' && nextStatus !== 'ATTIVO') {
        const dbRefs = await findApprovalReferenceEmployeeNumbers(prisma, {
          approverId: existing.id,
          ignoreSubjectEmployeeNumbers: rewrittenSubjectNumbers,
        });
        const reaffirmed = (reaffirmedRoles.get(employeeNumber)?.size ?? 0) > 0;
        if (dbRefs.length > 0 || reaffirmed) {
          row.errors.push(
            `This employee is still used in approval workflows and cannot be made inactive in this import. Remove those approval assignments first.`
          );
        }
      }

      if (existing.canBeResponsible && !nextCanBeResponsible) {
        const dbRefs = await findApprovalReferenceEmployeeNumbers(prisma, {
          approverId: existing.id,
          roles: ['RESPONSABILE'],
          ignoreSubjectEmployeeNumbers: rewrittenSubjectNumbers,
        });
        const reaffirmed = reaffirmedRoles.get(employeeNumber)?.has('RESPONSABILE') ?? false;
        if (dbRefs.length > 0 || reaffirmed) {
          row.errors.push(
            `This employee is still used as Responsabile and cannot have Responsabile eligibility disabled in this import.`
          );
        }
      }

      if (existing.canBeSubstituteResponsible && !nextCanBeSubstitute) {
        const dbRefs = await findApprovalReferenceEmployeeNumbers(prisma, {
          approverId: existing.id,
          roles: ['SUBSTITUTE_RESPONSABILE'],
          ignoreSubjectEmployeeNumbers: rewrittenSubjectNumbers,
        });
        const reaffirmed = reaffirmedRoles.get(employeeNumber)?.has('SUBSTITUTE_RESPONSABILE') ?? false;
        if (dbRefs.length > 0 || reaffirmed) {
          row.errors.push(
            `This employee is still used as Sostituto-Responsabile and cannot have substitute eligibility disabled in this import.`
          );
        }
      }

      if (row.errors.length > 0) {
        row.proposedAction = null;
        row.selected = false;
      }
    }

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

      const parsedRows = rows.map((row) => ({
        row,
        parsed: employeeWriteSchema.parse(row.normalized),
        roleNumbers: roleNumbersFromNormalized(row.normalized),
      }));
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

      const savedRows = [];
      for (const { row, parsed, roleNumbers } of parsedRows) {
        const before = await tx.employee.findUnique({
          where: { employeeNumber: parsed.employeeNumber },
          include: employeeDetailsInclude,
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
                  tfr: before.tfr,
                  canBeSubstituteResponsible: before.canBeSubstituteResponsible,
                  weeklySchedule: weeklyScheduleFromEmployee(before),
                },
                policy
              ),
            })
          : await tx.employee.create({
              data: toEmployeeData(parsed, undefined, policy),
            });

        savedRows.push({ row, parsed, roleNumbers, before, employeeId: employee.id });
      }

      const referencedEmployeeNumbers = new Set<number>();
      for (const { parsed, roleNumbers } of parsedRows) {
        referencedEmployeeNumbers.add(parsed.employeeNumber);
        for (const employeeNumber of allApprovalRoleNumbers(roleNumbers)) referencedEmployeeNumbers.add(employeeNumber);
      }
      const employeesByNumber = await tx.employee.findMany({
        where: { employeeNumber: { in: [...referencedEmployeeNumbers] } },
        select: { id: true, employeeNumber: true },
      });
      const employeeByNumberAfterSave = new Map(
        employeesByNumber.map((employee) => [employee.employeeNumber, employee])
      );
      // Subjects this import rewrites authoritatively (rows carrying role
      // columns). Their post-import inbound references come entirely from the
      // file, so the DB reference scan in the eligibility check must ignore them.
      const rewrittenSubjectNumbers = new Set(
        savedRows.filter((saved) => saved.roleNumbers).map((saved) => saved.parsed.employeeNumber)
      );

      for (const saved of savedRows) {
        const missingApproverNumber = allApprovalRoleNumbers(saved.roleNumbers).find(
          (employeeNumber) => !employeeByNumberAfterSave.has(employeeNumber)
        );
        if (missingApproverNumber !== undefined) {
          throw new HttpError(
            409,
            'APPROVER_NOT_FOUND',
            `Approver Employee Number ${missingApproverNumber} does not exist in ED or the selected import rows.`
          );
        }
        const roleIds =
          approvalRoleIdsFromNumbers(saved.roleNumbers, employeeByNumberAfterSave) ??
          (saved.before ? await existingApprovalRoleIds(tx, saved.employeeId) : emptyApprovalRoleIds());
        // Grandfather (role, approver) pairs this employee already had: a plain
        // field-only re-import (no role columns) must not fail just because
        // someone else's record changed since those approvers were assigned.
        const grandfatheredApprovers = saved.roleNumbers
          ? undefined
          : new Set(
              saved.before
                ? approvalRoleEntries(roleIds).map(({ id, role }) => roleApproverKey(role, id))
                : []
            );
        await validateApprovalRoleIds(tx, {
          roleIds,
          employeeNumber: saved.parsed.employeeNumber,
          status: saved.parsed.status,
          currentEmployeeId: saved.employeeId,
          grandfatheredApprovers,
        });
        if (saved.roleNumbers) {
          await replaceApprovalAssignments(tx, saved.employeeId, roleIds);
        }
      }

      for (const saved of savedRows) {
        await validateEmployeeCanLoseApprovalEligibility(tx, {
          employeeId: saved.employeeId,
          // New employees have no prior state: model them as not-yet-active and
          // not-yet-eligible so the "losing eligibility" branches don't fire on
          // a record that never had anything to lose.
          currentStatus: saved.before?.status ?? 'DA_ASSUMERE',
          nextStatus: saved.parsed.status,
          currentCanBeResponsible: saved.before?.canBeResponsible ?? false,
          nextCanBeResponsible: saved.parsed.canBeResponsible ?? saved.before?.canBeResponsible ?? false,
          currentCanBeSubstituteResponsible: saved.before?.canBeSubstituteResponsible ?? false,
          nextCanBeSubstituteResponsible:
            saved.parsed.canBeSubstituteResponsible ?? saved.before?.canBeSubstituteResponsible ?? false,
          ignoreSubjectEmployeeNumbers: rewrittenSubjectNumbers,
        });
      }

      const refreshed = await tx.employee.findMany({
        where: { id: { in: savedRows.map((saved) => saved.employeeId) } },
        include: employeeDetailsInclude,
      });
      const refreshedById = new Map(refreshed.map((employee) => [employee.id, employee]));

      const committed = [];
      for (const saved of savedRows) {
        const employee = refreshedById.get(saved.employeeId);
        if (!employee) {
          throw new HttpError(500, 'IMPORT_COMMIT_FAILED', 'A committed employee could not be reloaded.');
        }
        await writeAuditLog({
          tx,
          user,
          requestId: id,
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          employeeNumber: employee.employeeNumber,
          action: saved.before ? 'UPDATE' : 'CREATE',
          before: saved.before ? jsonSnapshot(serializeEmployee(saved.before)) : null,
          after: jsonSnapshot(serializeEmployee(employee)),
          importBatchId: batchId,
        });
        const rowUpdate = await tx.importRow.updateMany({
          where: { id: saved.row.id, status: 'PENDING' },
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
