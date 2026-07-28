import { WEEKDAY_KEYS, type Language } from '@itatti/shared';
import type { EmployeeDetails } from './approvals.js';

/**
 * The minimal employee projection the Ferie portal syncs from, kept separate from
 * the admin/v1 serializers because it answers to an external contract
 * (docs/openapi/time-off-directory.yaml) rather than to this app's own UI.
 *
 * Everything here is pure so the mapping rules — schedule splitting, status and
 * role mapping, approver flattening — are unit-testable without a database.
 */

export const APP_ROLES = ['FERIE_FINAL_APPROVER', 'FERIE_PORTAL_ADMIN', 'STAFF_IT'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const TIME_OFF_APPROVER_ROLES = ['PRE_APPROVER', 'RESPONSABILE', 'SUBSTITUTE_RESPONSABILE'] as const;
export type TimeOffApproverRole = (typeof TIME_OFF_APPROVER_ROLES)[number];

export type WorkInterval = {
  weekday: number;
  start: string;
  end: string;
};

export type TimeOffApprover = {
  employeeSourceId: string;
  role: TimeOffApproverRole;
};

export type TimeOffEmployee = {
  id: string;
  employeeNumber: string;
  auth0Subject: string;
  workEmail: string;
  displayName: string;
  title: string | null;
  department: { id: string; name: string; updatedAt: string };
  status: 'ACTIVE' | 'INACTIVE';
  fte: number;
  schedule: WorkInterval[];
  roles: AppRole[];
  preferredLanguage: Language;
  approvers: TimeOffApprover[];
  updatedAt: string;
};

/** Anchor for every derived working day. The contract carries clock times, but ED stores only durations. */
const DAY_START_MINUTES = 9 * 60;
/** Unpaid break inserted once a day runs longer than {@link SPLIT_THRESHOLD_MINUTES}. */
const BREAK_MINUTES = 30;
const SPLIT_THRESHOLD_MINUTES = 240;
const MINUTES_PER_DAY = 24 * 60;
/**
 * Latest representable end time. The contract's clock pattern tops out at 23:59,
 * so a day may not finish at 24:00 even though that is the same instant as
 * midnight — it would serialize to a value the consumer rejects.
 */
const LAST_END_MINUTE = MINUTES_PER_DAY - 1;

function clock(minutesFromMidnight: number): string {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Turns one day's contracted minutes into the clock intervals Ferie deducts
 * hourly permesso from, so they must always total that day's minutes exactly.
 *
 * Days longer than four hours are split by an unpaid 30-minute break, with the
 * odd minute going to the morning. A day long enough that 09:00 + work + break
 * would cross midnight starts earlier instead of overflowing the clock.
 */
export function dailyWorkIntervals(weekday: number, minutes: number): WorkInterval[] {
  if (minutes <= 0) return [];

  const split = minutes > SPLIT_THRESHOLD_MINUTES;
  const span = minutes + (split ? BREAK_MINUTES : 0);
  if (span > LAST_END_MINUTE) {
    throw new Error(
      `A ${minutes}-minute working day cannot be represented as clock intervals within a single day.`
    );
  }
  const start = Math.min(DAY_START_MINUTES, LAST_END_MINUTE - span);

  if (!split) {
    return [{ weekday, start: clock(start), end: clock(start + minutes) }];
  }

  const morning = Math.ceil(minutes / 2);
  const afternoonStart = start + morning + BREAK_MINUTES;
  return [
    { weekday, start: clock(start), end: clock(start + morning) },
    { weekday, start: clock(afternoonStart), end: clock(afternoonStart + (minutes - morning)) },
  ];
}

type WeeklyMinutes = Pick<
  EmployeeDetails,
  'mondayMinutes' | 'tuesdayMinutes' | 'wednesdayMinutes' | 'thursdayMinutes' | 'fridayMinutes'
>;

/** Monday-Friday intervals, in weekday order, skipping days with no contracted time. */
export function weeklyWorkIntervals(employee: WeeklyMinutes): WorkInterval[] {
  const minutesByWeekday: number[] = [
    employee.mondayMinutes,
    employee.tuesdayMinutes,
    employee.wednesdayMinutes,
    employee.thursdayMinutes,
    employee.fridayMinutes,
  ];
  return WEEKDAY_KEYS.flatMap((_key, index) => dailyWorkIntervals(index + 1, minutesByWeekday[index] ?? 0));
}

/** Ferie only distinguishes active from inactive; ED's DA_ASSUMERE is not yet active. */
export function timeOffStatus(status: EmployeeDetails['status']): 'ACTIVE' | 'INACTIVE' {
  return status === 'ATTIVO' ? 'ACTIVE' : 'INACTIVE';
}

/**
 * Stable identity key for the portal. ED does not model Auth0 identities yet, so
 * this is synthesized from the Employee Number — which never changes for a
 * person — because Ferie keys its mirror rows on it across syncs. Replace this
 * with the real tenant subject once ED stores Auth0 identities.
 */
export function auth0SubjectFor(employeeNumber: number): string {
  return `auth0|ed-${employeeNumber}`;
}

/**
 * Parses the employee-number-to-application-role map from configuration, e.g.
 * `201:STAFF_IT|FERIE_PORTAL_ADMIN,202:FERIE_FINAL_APPROVER`.
 *
 * ED holds no application-role master data, so without this every synced mirror
 * row would arrive with no roles and nobody could administer the portal. Unknown
 * role names and malformed entries are rejected loudly at boot rather than
 * silently dropping a grant an operator believed they had made.
 */
export function parseAppRoleAssignments(value: string | undefined): Map<number, AppRole[]> {
  const assignments = new Map<number, AppRole[]>();
  if (!value?.trim()) return assignments;

  for (const entry of value.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [rawNumber, rawRoles = ''] = trimmed.split(':');
    const employeeNumber = Number(rawNumber?.trim());
    if (!Number.isInteger(employeeNumber) || employeeNumber <= 0) {
      throw new Error(`Invalid employee number in role assignment: ${trimmed}`);
    }
    const roles = rawRoles
      .split('|')
      .map((role) => role.trim().toUpperCase())
      .filter(Boolean);
    if (roles.length === 0) {
      throw new Error(`No roles listed for employee number ${employeeNumber}.`);
    }
    for (const role of roles) {
      if (!APP_ROLES.includes(role as AppRole)) {
        throw new Error(`Unknown application role "${role}" for employee number ${employeeNumber}.`);
      }
    }
    const existing = assignments.get(employeeNumber) ?? [];
    assignments.set(employeeNumber, [...new Set([...existing, ...(roles as AppRole[])])]);
  }

  return assignments;
}

const APPROVER_ROLE_ORDER: Record<TimeOffApproverRole, number> = {
  PRE_APPROVER: 0,
  RESPONSABILE: 1,
  SUBSTITUTE_RESPONSABILE: 2,
};

/**
 * Flattens ED's per-role approver assignments into the contract's single list.
 * Sorted by role then approver id so a resync of unchanged data produces an
 * identical payload.
 */
export function flattenApprovers(
  // Only the two fields the contract needs, so callers (and tests) need not build
  // a full Prisma payload just to exercise the ordering.
  assignments: ReadonlyArray<{ approverId: string; role: TimeOffApproverRole }>
): TimeOffApprover[] {
  return assignments
    .map((assignment) => ({ employeeSourceId: assignment.approverId, role: assignment.role }))
    .sort(
      (left, right) =>
        APPROVER_ROLE_ORDER[left.role] - APPROVER_ROLE_ORDER[right.role] ||
        left.employeeSourceId.localeCompare(right.employeeSourceId)
    );
}

export function projectTimeOffEmployee(
  employee: EmployeeDetails,
  appRoles: Map<number, AppRole[]>
): TimeOffEmployee {
  return {
    id: employee.id,
    employeeNumber: String(employee.employeeNumber),
    auth0Subject: auth0SubjectFor(employee.employeeNumber),
    workEmail: employee.workEmail,
    displayName: `${employee.firstName} ${employee.lastName}`,
    // ED has no job-title field; the contract allows null rather than a guess.
    title: null,
    department: {
      id: employee.department.id,
      name: employee.department.name,
      updatedAt: employee.department.updatedAt.toISOString(),
    },
    status: timeOffStatus(employee.status),
    fte: Number(employee.fte),
    schedule: weeklyWorkIntervals(employee),
    roles: appRoles.get(employee.employeeNumber) ?? [],
    preferredLanguage: employee.preferredLanguage,
    approvers: flattenApprovers(employee.approvalAssignments),
    updatedAt: employee.updatedAt.toISOString(),
  };
}
