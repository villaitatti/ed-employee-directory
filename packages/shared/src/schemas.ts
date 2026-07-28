import { z } from 'zod';
import {
  AUDIT_ACTIONS,
  CONTRACT_TYPES,
  EMPLOYEE_STATUSES,
  ENTITY_TYPES,
  FULL_TIME_DAILY_MINUTES,
  IMPORT_PROPOSED_ACTIONS,
  IMPORT_ROW_STATUSES,
  LANGUAGES,
  RETIREMENT_MONTHS_MAX,
  RETIREMENT_MONTHS_MIN,
  RETIREMENT_YEARS_MAX,
  RETIREMENT_YEARS_MIN,
  TFR_OPTIONS,
  USA_CATEGORIES,
  WEEKDAY_KEYS,
  type WeekdayKey,
} from './constants.js';
import {
  DEFAULT_WEEKLY_SCHEDULE_MINUTES,
  formatSessantesimiMinutes,
  isValidDateString,
  normalizeWorkEmail,
  parseFteInput,
  parseSessantesimiInput,
  validateStatusDates,
  weeklyScheduleTotalMinutes,
} from './domain.js';

export const dateStringSchema = z.string().refine(isValidDateString, {
  message: 'Date must be a valid YYYY-MM-DD calendar date.',
});

export const employeeStatusSchema = z.enum(EMPLOYEE_STATUSES);
export const languageSchema = z.enum(LANGUAGES);
export const contractTypeSchema = z.enum(CONTRACT_TYPES);

// HR-entered authoritative address. Never derived from names and never given a
// fallback, so a blank cell has to fail rather than silently invent an address.
export const workEmailSchema = z
  .string()
  .trim()
  .max(320)
  // Checked in sequence rather than as chained refinements so a blank cell reports
  // only "required" instead of also complaining that "" is not an address.
  .superRefine((value, ctx) => {
    if (!value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Work Email is required.' });
      return;
    }
    if (!z.string().email().safeParse(value).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Work Email must be a valid email address.' });
    }
  })
  .transform(normalizeWorkEmail);
export const tfrSchema = z.enum(TFR_OPTIONS);
export const usaCategorySchema = z.enum(USA_CATEGORIES);
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export const entityTypeSchema = z.enum(ENTITY_TYPES);
export const importRowStatusSchema = z.enum(IMPORT_ROW_STATUSES);
export const importProposedActionSchema = z.enum(IMPORT_PROPOSED_ACTIONS);

const sessantesimiInputSchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return parseSessantesimiInput(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : 'Invalid hours.',
    });
    return z.NEVER;
  }
});

const weekdayShape = <T extends z.ZodTypeAny>(value: T) =>
  Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, value])) as Record<WeekdayKey, T>;

export const weeklyScheduleInputSchema = z.object(
  weekdayShape(sessantesimiInputSchema.default(FULL_TIME_DAILY_MINUTES))
);
export type WeeklyScheduleInput = z.infer<typeof weeklyScheduleInputSchema>;

const scheduleDaySchema = z.object({
  minutes: z.number().int().min(0).max(24 * 60),
  display: z.string(),
});

export const weeklyScheduleSchema = z.object({
  ...weekdayShape(scheduleDaySchema),
  total: z.object({
    minutes: z.number().int().min(0),
    display: z.string(),
  }),
});
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;

export function serializeWeeklySchedule(input: WeeklyScheduleInput): WeeklySchedule {
  const total = weeklyScheduleTotalMinutes(input);
  const days = Object.fromEntries(
    WEEKDAY_KEYS.map((key) => [key, { minutes: input[key], display: formatSessantesimiMinutes(input[key]) }])
  ) as Record<WeekdayKey, { minutes: number; display: string }>;
  return {
    ...days,
    total: { minutes: total, display: formatSessantesimiMinutes(total) },
  };
}

const idArraySchema = z.array(z.string().min(1));
const employeeNumberArraySchema = z.array(z.coerce.number().int().positive());

export const emptyEmployeeApprovalRoleIds = {
  preApproverIds: [],
  responsabileIds: [],
  substituteResponsabileIds: [],
} as const;

export const employeeApprovalRoleIdsSchema = z.object({
  preApproverIds: idArraySchema.default([]),
  responsabileIds: idArraySchema.default([]),
  substituteResponsabileIds: idArraySchema.default([]),
});
export type EmployeeApprovalRoleIds = z.infer<typeof employeeApprovalRoleIdsSchema>;

export const employeeApprovalRoleNumbersSchema = z.object({
  preApproverNumbers: employeeNumberArraySchema.default([]),
  responsabileNumbers: employeeNumberArraySchema.default([]),
  substituteResponsabileNumbers: employeeNumberArraySchema.default([]),
});
export type EmployeeApprovalRoleNumbers = z.infer<typeof employeeApprovalRoleNumbersSchema>;

export const retirementPolicySchema = z.object({
  years: z.coerce.number().int().min(RETIREMENT_YEARS_MIN).max(RETIREMENT_YEARS_MAX),
  months: z.coerce.number().int().min(RETIREMENT_MONTHS_MIN).max(RETIREMENT_MONTHS_MAX),
});
export type RetirementPolicyInput = z.infer<typeof retirementPolicySchema>;

export const settingsSchema = z.object({
  // Reuse the policy schema so the shape has a single source of truth.
  retirementPolicy: retirementPolicySchema,
  updatedAt: z.string().nullable(),
  // True when a stored policy row exists but failed to parse; the retirementPolicy
  // above is then the statutory fallback, not the configured value.
  malformed: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Department = z.infer<typeof departmentSchema>;

export const departmentCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
});
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;

export const employeeApprovalReferenceSchema = z.object({
  id: z.string(),
  employeeNumber: z.number().int().positive(),
  firstName: z.string(),
  lastName: z.string(),
  status: employeeStatusSchema,
  department: departmentSchema,
});
export type EmployeeApprovalReference = z.infer<typeof employeeApprovalReferenceSchema>;

export const employeeOptionSchema = employeeApprovalReferenceSchema.extend({
  canBeResponsible: z.boolean(),
  canBeSubstituteResponsible: z.boolean(),
});
export type EmployeeOption = z.infer<typeof employeeOptionSchema>;

export const employeeApprovalRolesSchema = z.object({
  preApprovers: z.array(employeeApprovalReferenceSchema),
  responsabili: z.array(employeeApprovalReferenceSchema),
  substituteResponsabili: z.array(employeeApprovalReferenceSchema),
});
export type EmployeeApprovalRoles = z.infer<typeof employeeApprovalRolesSchema>;

export const employeeSchema = z.object({
  id: z.string(),
  employeeNumber: z.number().int().positive(),
  firstName: z.string(),
  lastName: z.string(),
  workEmail: z.string(),
  preferredLanguage: languageSchema,
  departmentId: z.string(),
  department: departmentSchema.optional(),
  birthDate: dateStringSchema,
  hireDate: dateStringSchema.nullable(),
  terminationDate: dateStringSchema.nullable(),
  retirementDate: dateStringSchema,
  retirementDateOverridden: z.boolean(),
  fte: z.number().positive().max(1),
  usaCategory: usaCategorySchema,
  contractType: contractTypeSchema,
  tfr: tfrSchema,
  status: employeeStatusSchema,
  canBeResponsible: z.boolean(),
  canBeSubstituteResponsible: z.boolean(),
  weeklySchedule: weeklyScheduleSchema,
  approvalRoles: employeeApprovalRolesSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Employee = z.infer<typeof employeeSchema>;

export const employeeWriteBaseSchema = z.object({
    employeeNumber: z.coerce.number().int().positive(),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    workEmail: workEmailSchema,
    // Optional on the wire so a partial import that omits the column keeps the
    // stored preference; toEmployeeData falls back to the existing row, then IT.
    preferredLanguage: languageSchema.optional(),
    departmentId: z.string().min(1),
    birthDate: dateStringSchema,
    hireDate: dateStringSchema.nullable().optional(),
    terminationDate: dateStringSchema.nullable().optional(),
    retirementDate: dateStringSchema.nullable().optional(),
    resetRetirementDate: z.boolean().optional(),
    retirementDateOverridden: z.boolean().optional(),
    fte: z.union([z.string(), z.number()]).transform((value, ctx) => {
      try {
        return parseFteInput(value);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : 'Invalid FTE.',
        });
        return z.NEVER;
      }
    }),
    usaCategory: usaCategorySchema,
    contractType: contractTypeSchema,
    tfr: tfrSchema.optional(),
    status: employeeStatusSchema,
    canBeResponsible: z.boolean().optional(),
    canBeSubstituteResponsible: z.boolean().optional(),
    weeklySchedule: weeklyScheduleInputSchema.optional(),
    approvalRoleIds: employeeApprovalRoleIdsSchema.optional(),
  });

export const employeeWriteSchema = employeeWriteBaseSchema
  .superRefine((value, ctx) => {
    const roleIds = value.approvalRoleIds;
    if (roleIds) {
      const roleGroups = [
        { path: ['approvalRoleIds', 'preApproverIds'], ids: roleIds.preApproverIds },
        { path: ['approvalRoleIds', 'responsabileIds'], ids: roleIds.responsabileIds },
        { path: ['approvalRoleIds', 'substituteResponsabileIds'], ids: roleIds.substituteResponsabileIds },
      ] as const;
      for (const { path, ids } of roleGroups) {
        if (new Set(ids).size !== ids.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path],
            message: 'Duplicate approvers are not allowed in the same role.',
          });
        }
      }
    }
    if (value.retirementDateOverridden && !value.retirementDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retirementDate'],
        message: 'Confirmed retirement dates require a retirement date.',
      });
    }
    // Path the cross-field date rules at the input that has to change, so a
    // rejected save comes back as a field error the form can highlight rather
    // than an unattributed sentence in `formErrors`.
    for (const error of validateStatusDates(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [error.field], message: error.message });
    }
  });
export type EmployeeWriteInput = z.infer<typeof employeeWriteSchema>;

export const employeeListQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: employeeStatusSchema.optional(),
  departmentId: z.string().optional(),
  updatedSince: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

export const paginatedEmployeesSchema = z.object({
  data: z.array(employeeSchema),
  nextCursor: z.string().nullable(),
});
export type PaginatedEmployees = z.infer<typeof paginatedEmployeesSchema>;

export const auditLogSchema = z.object({
  id: z.string(),
  actorSub: z.string(),
  actorEmail: z.string().nullable(),
  entityType: entityTypeSchema,
  entityId: z.string().nullable(),
  employeeNumber: z.number().int().nullable(),
  action: auditActionSchema,
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  requestId: z.string(),
  importBatchId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const importPreviewRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  original: z.record(z.string()),
  normalized: employeeWriteBaseSchema
    .extend({
      approvalRoleEmployeeNumbers: employeeApprovalRoleNumbersSchema.optional(),
    })
    .partial()
    .nullable(),
  errors: z.array(z.string()),
  proposedAction: importProposedActionSchema.nullable(),
  existingEmployeeId: z.string().nullable(),
  selected: z.boolean(),
});
export type ImportPreviewRow = z.infer<typeof importPreviewRowSchema>;

export const importPreviewSchema = z.object({
  batchId: z.string(),
  rows: z.array(importPreviewRowSchema),
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;

export const importCommitSchema = z
  .object({
    selectedRows: z.array(z.number().int().positive()).min(1),
  })
  .refine((value) => new Set(value.selectedRows).size === value.selectedRows.length, {
    message: 'Selected rows must be unique.',
    path: ['selectedRows'],
  });
export type ImportCommitInput = z.infer<typeof importCommitSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
