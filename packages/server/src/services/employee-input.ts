import type { EmployeeWriteInput, RetirementPolicy, TfrOption, WeeklyScheduleInput } from '@itatti/shared';
import { DEFAULT_WEEKLY_SCHEDULE_MINUTES, resolveRetirementDate } from '@itatti/shared';

function dateOnlyToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nullableDateToUtc(value: string | null | undefined): Date | null {
  return value ? dateOnlyToUtc(value) : null;
}

/**
 * Existing retirement state, when updating an employee. Lets resolveRetirementDate
 * preserve a confirmed government-approved date instead of recalculating it away.
 */
export type ExistingRetirement = {
  retirementDate: string | null;
  retirementDateOverridden: boolean;
  tfr?: TfrOption | null;
  canBeSubstituteResponsible?: boolean | null;
  weeklySchedule?: WeeklyScheduleInput | null;
};

export function toEmployeeData(
  input: EmployeeWriteInput,
  existing?: ExistingRetirement,
  policy?: RetirementPolicy
) {
  const retirement = resolveRetirementDate({
    birthDate: input.birthDate,
    ...(policy ? { policy } : {}),
    ...(input.retirementDate !== undefined ? { requestedRetirementDate: input.retirementDate } : {}),
    ...(input.resetRetirementDate !== undefined ? { resetOverride: input.resetRetirementDate } : {}),
    ...(input.retirementDateOverridden !== undefined ? { confirmRetirementDate: input.retirementDateOverridden } : {}),
    ...(existing
      ? {
          currentRetirementDate: existing.retirementDate,
          currentRetirementDateOverridden: existing.retirementDateOverridden,
        }
      : {}),
  });
  const weeklySchedule = input.weeklySchedule ?? existing?.weeklySchedule ?? DEFAULT_WEEKLY_SCHEDULE_MINUTES;

  return {
    employeeNumber: input.employeeNumber,
    firstName: input.firstName,
    lastName: input.lastName,
    departmentId: input.departmentId,
    birthDate: dateOnlyToUtc(input.birthDate),
    hireDate: nullableDateToUtc(input.hireDate),
    terminationDate: nullableDateToUtc(input.terminationDate),
    retirementDate: dateOnlyToUtc(retirement.retirementDate),
    retirementDateOverridden: retirement.retirementDateOverridden,
    fte: input.fte,
    usaCategory: input.usaCategory,
    contractType: input.contractType,
    tfr: input.tfr ?? existing?.tfr ?? 'I_TATTI',
    status: input.status,
    canBeSubstituteResponsible: input.canBeSubstituteResponsible ?? existing?.canBeSubstituteResponsible ?? false,
    mondayMinutes: weeklySchedule.monday,
    tuesdayMinutes: weeklySchedule.tuesday,
    wednesdayMinutes: weeklySchedule.wednesday,
    thursdayMinutes: weeklySchedule.thursday,
    fridayMinutes: weeklySchedule.friday,
  };
}
