import type { EmployeeWriteInput } from '@itatti/shared';
import { calculateRetirementDate, resolveRetirementDate } from '@itatti/shared';

function dateValue(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function toEmployeeData(input: EmployeeWriteInput) {
  const retirement = resolveRetirementDate({
    birthDate: input.birthDate,
    ...(input.retirementDate !== undefined ? { requestedRetirementDate: input.retirementDate } : {}),
    ...(input.resetRetirementDate !== undefined ? { resetOverride: input.resetRetirementDate } : {}),
  });

  return {
    employeeNumber: input.employeeNumber,
    firstName: input.firstName,
    lastName: input.lastName,
    departmentId: input.departmentId,
    birthDate: dateValue(input.birthDate) ?? new Date(`${input.birthDate}T00:00:00.000Z`),
    hireDate: dateValue(input.hireDate),
    terminationDate: dateValue(input.terminationDate),
    retirementDate: dateValue(retirement.retirementDate) ?? new Date(`${calculateRetirementDate(input.birthDate)}T00:00:00.000Z`),
    retirementDateOverridden: retirement.retirementDateOverridden,
    fte: input.fte,
    usaCategory: input.usaCategory,
    contractType: input.contractType,
    status: input.status,
  };
}
