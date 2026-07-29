import {
  DEFAULT_WEEKLY_SCHEDULE_MINUTES,
  formatSessantesimiMinutes,
  parseFteInput,
  parseSessantesimiInput,
  type ContractType,
  type Employee,
  type EmployeeStatus,
  type Language,
  type TfrOption,
  type UsaCategory,
  type WeekdayKey,
} from '@itatti/shared';

export type EmployeeDraft = {
  id?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  preferredLanguage: Language;
  departmentId: string;
  birthDate: string;
  hireDate: string;
  terminationDate: string;
  retirementDate: string;
  retirementDateOverridden: boolean;
  fte: string;
  usaCategory: UsaCategory;
  contractType: ContractType;
  tfr: TfrOption;
  status: EmployeeStatus;
  canBeResponsible: boolean;
  canBeSubstituteResponsible: boolean;
  weeklySchedule: Record<WeekdayKey, string>;
  approvalRoleIds: {
    preApproverIds: string[];
    responsabileIds: string[];
    substituteResponsabileIds: string[];
  };
};

export const emptyEmployeeDraft: EmployeeDraft = {
  employeeNumber: '',
  firstName: '',
  lastName: '',
  workEmail: '',
  preferredLanguage: 'IT',
  departmentId: '',
  birthDate: '',
  hireDate: '',
  terminationDate: '',
  retirementDate: '',
  retirementDateOverridden: false,
  fte: '1',
  usaCategory: 'EXEMPT',
  contractType: 'INDETERMINATO',
  tfr: 'I_TATTI',
  status: 'ATTIVO',
  canBeResponsible: false,
  canBeSubstituteResponsible: false,
  weeklySchedule: {
    monday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.monday),
    tuesday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.tuesday),
    wednesday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.wednesday),
    thursday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.thursday),
    friday: formatSessantesimiMinutes(DEFAULT_WEEKLY_SCHEDULE_MINUTES.friday),
  },
  approvalRoleIds: {
    preApproverIds: [],
    responsabileIds: [],
    substituteResponsabileIds: [],
  },
};

export function toEmployeeDraft(employee: Employee): EmployeeDraft {
  return {
    id: employee.id,
    employeeNumber: String(employee.employeeNumber),
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail,
    preferredLanguage: employee.preferredLanguage,
    departmentId: employee.departmentId,
    birthDate: employee.birthDate,
    hireDate: employee.hireDate ?? '',
    terminationDate: employee.terminationDate ?? '',
    retirementDate: employee.retirementDate,
    retirementDateOverridden: employee.retirementDateOverridden,
    fte: String(employee.fte).replace('.', ','),
    usaCategory: employee.usaCategory,
    contractType: employee.contractType,
    tfr: employee.tfr,
    status: employee.status,
    canBeResponsible: employee.canBeResponsible,
    canBeSubstituteResponsible: employee.canBeSubstituteResponsible,
    weeklySchedule: {
      monday: employee.weeklySchedule.monday.display,
      tuesday: employee.weeklySchedule.tuesday.display,
      wednesday: employee.weeklySchedule.wednesday.display,
      thursday: employee.weeklySchedule.thursday.display,
      friday: employee.weeklySchedule.friday.display,
    },
    approvalRoleIds: {
      preApproverIds: employee.approvalRoles.preApprovers.map((approver) => approver.id),
      responsabileIds: employee.approvalRoles.responsabili.map((approver) => approver.id),
      substituteResponsabileIds: employee.approvalRoles.substituteResponsabili.map((approver) => approver.id),
    },
  };
}

/**
 * Serialized form of a draft for unsaved-changes detection. `retirementDate` is
 * only submitted while the override is on — otherwise the server recalculates it
 * — so a date parked there with the switch off cannot change what gets saved and
 * must not trigger the discard prompt.
 */
export function employeeDirtyFingerprint(draft: EmployeeDraft): string {
  return JSON.stringify(draft.retirementDateOverridden ? draft : { ...draft, retirementDate: '' });
}

/**
 * How a person is named everywhere they are named: forename first.
 *
 * Lists here are still *ordered* by surname — that is what makes a directory
 * scannable, and the API sorts on it — but ordering by a name and writing it
 * backwards are two different decisions, and only the first one has a reason.
 */
export function employeeFullName(employee: {
  firstName?: string | undefined;
  lastName?: string | undefined;
}): string {
  return [employee.firstName, employee.lastName].filter(Boolean).join(' ');
}

export function parseDraftFte(value: string): number | null {
  try {
    return parseFteInput(value);
  } catch {
    return null;
  }
}

export function parseDraftWeeklySchedule(schedule: Record<WeekdayKey, string>): Record<WeekdayKey, number> | null {
  try {
    return {
      monday: parseSessantesimiInput(schedule.monday),
      tuesday: parseSessantesimiInput(schedule.tuesday),
      wednesday: parseSessantesimiInput(schedule.wednesday),
      thursday: parseSessantesimiInput(schedule.thursday),
      friday: parseSessantesimiInput(schedule.friday),
    };
  } catch {
    return null;
  }
}
