import type { AuditLog, Department, Employee, Prisma } from '@prisma/client';
import type { AuditLog as AuditLogDto, Department as DepartmentDto, Employee as EmployeeDto } from '@itatti/shared';

type EmployeeWithDepartment = Employee & { department?: Department };

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
    status: employee.status,
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
