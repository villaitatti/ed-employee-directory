import { z } from 'zod';
import {
  AUDIT_ACTIONS,
  CONTRACT_TYPES,
  EMPLOYEE_STATUSES,
  ENTITY_TYPES,
  IMPORT_PROPOSED_ACTIONS,
  IMPORT_ROW_STATUSES,
  USA_CATEGORIES,
} from './constants.js';
import { isValidDateString, parseFteInput, validateStatusDates } from './domain.js';

export const dateStringSchema = z.string().refine(isValidDateString, {
  message: 'Date must be a valid YYYY-MM-DD calendar date.',
});

export const employeeStatusSchema = z.enum(EMPLOYEE_STATUSES);
export const contractTypeSchema = z.enum(CONTRACT_TYPES);
export const usaCategorySchema = z.enum(USA_CATEGORIES);
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export const entityTypeSchema = z.enum(ENTITY_TYPES);
export const importRowStatusSchema = z.enum(IMPORT_ROW_STATUSES);
export const importProposedActionSchema = z.enum(IMPORT_PROPOSED_ACTIONS);

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

export const employeeSchema = z.object({
  id: z.string(),
  employeeNumber: z.number().int().positive(),
  firstName: z.string(),
  lastName: z.string(),
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
  status: employeeStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Employee = z.infer<typeof employeeSchema>;

export const employeeWriteBaseSchema = z.object({
    employeeNumber: z.coerce.number().int().positive(),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    departmentId: z.string().min(1),
    birthDate: dateStringSchema,
    hireDate: dateStringSchema.nullable().optional(),
    terminationDate: dateStringSchema.nullable().optional(),
    retirementDate: dateStringSchema.nullable().optional(),
    resetRetirementDate: z.boolean().optional(),
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
    status: employeeStatusSchema,
  });

export const employeeWriteSchema = employeeWriteBaseSchema
  .superRefine((value, ctx) => {
    for (const error of validateStatusDates(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
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
  normalized: employeeWriteBaseSchema.partial().nullable(),
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
