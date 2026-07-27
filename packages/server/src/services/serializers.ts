import type { AuditLog, Department, Employee, EmployeeApprovalAssignment, Prisma } from '@prisma/client';
import { serializeWeeklySchedule } from '@itatti/shared';
import type {
  AuditLog as AuditLogDto,
  Department as DepartmentDto,
  Employee as EmployeeDto,
  EmployeeApprovalReference,
} from '@itatti/shared';

type ApprovalAssignmentWithApprover = EmployeeApprovalAssignment & {
  approver: Employee & { department?: Department };
};

type EmployeeWithDepartment = Employee & {
  department?: Department;
  approvalAssignments?: ApprovalAssignmentWithApprover[];
};

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function dateTime(value: Date): string {
  return value.toISOString();
}

function jsonValue(value: Prisma.JsonValue | null): unknown | null {
  return value === null ? null : value;
}

export function serializeDepartment(department: Department): DepartmentDto {
  return {
    id: department.id,
    name: department.name,
    normalizedName: department.normalizedName,
    createdAt: dateTime(department.createdAt),
    updatedAt: dateTime(department.updatedAt),
  };
}

function serializeApprovalReference(employee: Employee & { department?: Department }): EmployeeApprovalReference {
  if (!employee.department) {
    throw new Error('Approval reference serialization requires the approver department.');
  }
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    status: employee.status,
    department: serializeDepartment(employee.department),
  };
}

function approvalReferences(
  assignments: ApprovalAssignmentWithApprover[] | undefined,
  role: ApprovalAssignmentWithApprover['role']
): EmployeeApprovalReference[] {
  return (assignments ?? [])
    .filter((assignment) => assignment.role === role)
    .map((assignment) => serializeApprovalReference(assignment.approver))
    .sort((left, right) => left.employeeNumber - right.employeeNumber);
}

export function serializeEmployee(employee: EmployeeWithDepartment): EmployeeDto {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    departmentId: employee.departmentId,
    department: employee.department ? serializeDepartment(employee.department) : undefined,
    birthDate: dateOnly(employee.birthDate) ?? '',
    hireDate: dateOnly(employee.hireDate),
    terminationDate: dateOnly(employee.terminationDate),
    retirementDate: dateOnly(employee.retirementDate) ?? '',
    retirementDateOverridden: employee.retirementDateOverridden,
    fte: Number(employee.fte),
    usaCategory: employee.usaCategory,
    contractType: employee.contractType,
    tfr: employee.tfr,
    status: employee.status,
    canBeResponsible: employee.canBeResponsible,
    canBeSubstituteResponsible: employee.canBeSubstituteResponsible,
    weeklySchedule: serializeWeeklySchedule({
      monday: employee.mondayMinutes,
      tuesday: employee.tuesdayMinutes,
      wednesday: employee.wednesdayMinutes,
      thursday: employee.thursdayMinutes,
      friday: employee.fridayMinutes,
    }),
    approvalRoles: {
      preApprovers: approvalReferences(employee.approvalAssignments, 'PRE_APPROVER'),
      responsabili: approvalReferences(employee.approvalAssignments, 'RESPONSABILE'),
      substituteResponsabili: approvalReferences(employee.approvalAssignments, 'SUBSTITUTE_RESPONSABILE'),
    },
    createdAt: dateTime(employee.createdAt),
    updatedAt: dateTime(employee.updatedAt),
  };
}

export function serializeAuditLog(auditLog: AuditLog): AuditLogDto {
  return {
    id: auditLog.id,
    actorSub: auditLog.actorSub,
    actorEmail: auditLog.actorEmail,
    entityType: auditLog.entityType,
    entityId: auditLog.entityId,
    employeeNumber: auditLog.employeeNumber,
    action: auditLog.action,
    before: jsonValue(auditLog.before),
    after: jsonValue(auditLog.after),
    requestId: auditLog.requestId,
    importBatchId: auditLog.importBatchId,
    createdAt: dateTime(auditLog.createdAt),
  };
}
