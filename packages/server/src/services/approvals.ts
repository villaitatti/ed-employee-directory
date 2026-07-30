import { Prisma } from '@prisma/client';
import type { ApprovalRole, EmployeeStatus } from '@prisma/client';
import type { EmployeeApprovalRoleIds, WeeklyScheduleInput } from '@itatti/shared';
import { HttpError } from '../middleware/error.js';

export const employeeDetailsInclude = Prisma.validator<Prisma.EmployeeInclude>()({
  department: true,
  approvalAssignments: {
    include: {
      approver: {
        include: { department: true },
      },
    },
  },
});

export type EmployeeDetails = Prisma.EmployeeGetPayload<{ include: typeof employeeDetailsInclude }>;

export function weeklyScheduleFromEmployee(employee: {
  mondayMinutes: number;
  tuesdayMinutes: number;
  wednesdayMinutes: number;
  thursdayMinutes: number;
  fridayMinutes: number;
}): WeeklyScheduleInput {
  return {
    monday: employee.mondayMinutes,
    tuesday: employee.tuesdayMinutes,
    wednesday: employee.wednesdayMinutes,
    thursday: employee.thursdayMinutes,
    friday: employee.fridayMinutes,
  };
}

export function emptyApprovalRoleIds(): EmployeeApprovalRoleIds {
  return {
    preApproverIds: [],
    responsabileIds: [],
    substituteResponsabileIds: [],
  };
}

/** Maps each role-id field on EmployeeApprovalRoleIds to its ApprovalRole enum. */
const ROLE_ID_FIELDS = [
  ['preApproverIds', 'PRE_APPROVER'],
  ['responsabileIds', 'RESPONSABILE'],
  ['substituteResponsabileIds', 'SUBSTITUTE_RESPONSABILE'],
] as const;

/** Flattens the three role-id arrays into tagged {id, role} entries. */
export function approvalRoleEntries(roleIds: EmployeeApprovalRoleIds): Array<{ id: string; role: ApprovalRole }> {
  return ROLE_ID_FIELDS.flatMap(([field, role]) => roleIds[field].map((id) => ({ id, role })));
}

/**
 * Stable key identifying an approver *in a specific role*. Grandfathering is
 * keyed on this pair — never on the approver id alone — so that being a valid
 * approver in one role (e.g. Pre-approvatore) can never wave through a brand-new
 * assignment of the same person to a different role (e.g. Sostituto-Responsabile)
 * for which they may be ineligible.
 */
export function roleApproverKey(role: ApprovalRole, approverId: string): string {
  return `${role}:${approverId}`;
}

/**
 * The single source of truth for the "active employee must have approvers" rule.
 * Both the id-based API validators and the number-based import preview consult
 * this so the two paths can't drift. Returns the violated error codes (empty when
 * the rule is satisfied).
 */
export type RequiredApproverError = 'RESPONSABILE_REQUIRED' | 'SOSTITUTO_RESPONSABILE_REQUIRED';

export const REQUIRED_APPROVER_MESSAGES: Record<RequiredApproverError, string> = {
  RESPONSABILE_REQUIRED: 'Active employees require at least one Responsabile.',
  SOSTITUTO_RESPONSABILE_REQUIRED: 'Active employees require at least one Sostituto-Responsabile.',
};

export function missingRequiredApprovers(
  status: EmployeeStatus,
  counts: {
    hasResponsabile: boolean;
    hasSubstitute: boolean;
    /**
     * Whether at least one *other* employee is eligible to be assigned in the
     * role (active + carrying the matching capability flag). The requirement is
     * only enforced once such a candidate exists: this is the company-bootstrap
     * exception — the very first Responsabile / Sostituto-Responsabile can't be
     * required to have one assigned because there is nobody eligible to pick yet.
     */
    responsabileEligibleExists: boolean;
    substituteEligibleExists: boolean;
  }
): RequiredApproverError[] {
  if (status !== 'ATTIVO') return [];
  const missing: RequiredApproverError[] = [];
  if (counts.responsabileEligibleExists && !counts.hasResponsabile) missing.push('RESPONSABILE_REQUIRED');
  if (counts.substituteEligibleExists && !counts.hasSubstitute) missing.push('SOSTITUTO_RESPONSABILE_REQUIRED');
  return missing;
}

export async function existingApprovalRoleIds(
  tx: Prisma.TransactionClient,
  employeeId: string
): Promise<EmployeeApprovalRoleIds> {
  const assignments = await tx.employeeApprovalAssignment.findMany({
    where: { employeeId },
    select: { approverId: true, role: true },
  });
  const roleIds = emptyApprovalRoleIds();
  for (const assignment of assignments) {
    if (assignment.role === 'PRE_APPROVER') roleIds.preApproverIds.push(assignment.approverId);
    if (assignment.role === 'RESPONSABILE') roleIds.responsabileIds.push(assignment.approverId);
    if (assignment.role === 'SUBSTITUTE_RESPONSABILE') {
      roleIds.substituteResponsabileIds.push(assignment.approverId);
    }
  }
  return roleIds;
}

export async function validateApprovalRoleIds(
  tx: Prisma.TransactionClient,
  input: {
    roleIds: EmployeeApprovalRoleIds;
    employeeNumber: number;
    status: EmployeeStatus;
    currentEmployeeId?: string | undefined;
    /**
     * `(role, approverId)` pairs — see {@link roleApproverKey} — already assigned
     * to this employee. Entries in this set are "grandfathered": they were valid
     * when first assigned, so an unrelated edit (or an import that doesn't touch
     * approvals) must not fail just because one of them later went inactive or
     * lost substitute eligibility. Keying on the role (not the id alone) means a
     * newly-added assignment of an existing approver to a *different* role is
     * still fully validated. New approvers are always fully validated. The
     * required-count and self-approval rules always apply regardless.
     */
    grandfatheredApprovers?: ReadonlySet<string> | undefined;
  }
): Promise<void> {
  const [responsabileEligibleCount, substituteEligibleCount] = await Promise.all([
    tx.employee.count({
      where: { status: 'ATTIVO', canBeResponsible: true, employeeNumber: { not: input.employeeNumber } },
    }),
    tx.employee.count({
      where: { status: 'ATTIVO', canBeSubstituteResponsible: true, employeeNumber: { not: input.employeeNumber } },
    }),
  ]);
  const missing = missingRequiredApprovers(input.status, {
    hasResponsabile: input.roleIds.responsabileIds.length > 0,
    hasSubstitute: input.roleIds.substituteResponsabileIds.length > 0,
    responsabileEligibleExists: responsabileEligibleCount > 0,
    substituteEligibleExists: substituteEligibleCount > 0,
  });
  for (const code of missing) {
    throw new HttpError(400, code, REQUIRED_APPROVER_MESSAGES[code]);
  }

  const roleEntries = approvalRoleEntries(input.roleIds);
  const approverIds = [...new Set(roleEntries.map((entry) => entry.id))];
  if (approverIds.length === 0) return;

  const approvers = await tx.employee.findMany({
    where: { id: { in: approverIds } },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      status: true,
      canBeResponsible: true,
      canBeSubstituteResponsible: true,
    },
  });
  const approverById = new Map(approvers.map((approver) => [approver.id, approver]));

  for (const { id, role } of roleEntries) {
    const approver = approverById.get(id);
    if (!approver) {
      throw new HttpError(400, 'APPROVER_NOT_FOUND', `Approver employee id ${id} does not exist.`);
    }
    if (id === input.currentEmployeeId || approver.employeeNumber === input.employeeNumber) {
      throw new HttpError(400, 'SELF_APPROVER_NOT_ALLOWED', 'Employees cannot approve themselves.');
    }
    // Don't re-litigate approvers that were already assigned in THIS role: they
    // passed validation when first set, and an unrelated edit must not be blocked
    // by a later change to someone else's record. A new assignment of the same
    // person to a different role is not grandfathered and is validated below.
    if (input.grandfatheredApprovers?.has(roleApproverKey(role, id))) continue;
    // `details.approverName` travels alongside the English message so the web app
    // can render the same rule in the operator's language without re-fetching or
    // parsing the sentence.
    const approverName = `${approver.firstName} ${approver.lastName}`;
    if (approver.status !== 'ATTIVO') {
      throw new HttpError(
        400,
        'APPROVER_MUST_BE_ACTIVE',
        `${approverName} is not an active employee.`,
        { approverName }
      );
    }
    if (role === 'RESPONSABILE' && !approver.canBeResponsible) {
      throw new HttpError(
        400,
        'APPROVER_NOT_RESPONSABILE_ELIGIBLE',
        `${approverName} is not marked as Responsabile eligible.`,
        { approverName }
      );
    }
    if (role === 'SUBSTITUTE_RESPONSABILE' && !approver.canBeSubstituteResponsible) {
      throw new HttpError(
        400,
        'APPROVER_NOT_SUBSTITUTE_ELIGIBLE',
        `${approverName} is not marked as Sostituto-Responsabile eligible.`,
        { approverName }
      );
    }
  }
}

export async function replaceApprovalAssignments(
  tx: Prisma.TransactionClient,
  employeeId: string,
  roleIds: EmployeeApprovalRoleIds
): Promise<void> {
  await tx.employeeApprovalAssignment.deleteMany({ where: { employeeId } });
  const data = approvalRoleEntries(roleIds).map(({ id, role }) => ({
    employeeId,
    approverId: id,
    role,
  }));
  if (data.length > 0) {
    await tx.employeeApprovalAssignment.createMany({ data });
  }
}

/** Someone this person approves for, named well enough to find. */
export type ApprovalReference = {
  employeeNumber: number;
  firstName: string;
  lastName: string;
};

/**
 * Returns the employees that reference `approverId` as an approver, ordered by
 * surname like every other list of people here, and de-duplicated. Subjects whose
 * Employee Number is in `ignoreSubjectEmployeeNumbers` are excluded — used by the
 * import preview to ignore subjects whose assignments the same import will
 * authoritatively rewrite.
 *
 * Names, not just numbers: "remove this assignment from 1003" sends the operator
 * to the directory to find out who 1003 is before they can act on it.
 */
export async function findApprovalReferences(
  tx: Prisma.TransactionClient,
  input: {
    approverId: string;
    roles?: ApprovalRole[] | undefined;
    ignoreSubjectEmployeeNumbers?: ReadonlySet<number> | undefined;
  }
): Promise<ApprovalReference[]> {
  const references = await tx.employeeApprovalAssignment.findMany({
    where: {
      approverId: input.approverId,
      ...(input.roles ? { role: { in: input.roles } } : {}),
    },
    select: {
      employee: {
        select: {
          employeeNumber: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
  const byNumber = new Map<number, ApprovalReference>();
  for (const { employee } of references) {
    if (input.ignoreSubjectEmployeeNumbers?.has(employee.employeeNumber)) continue;
    byNumber.set(employee.employeeNumber, employee);
  }
  return [...byNumber.values()].sort(
    (left, right) =>
      left.lastName.localeCompare(right.lastName) ||
      left.firstName.localeCompare(right.firstName) ||
      left.employeeNumber - right.employeeNumber
  );
}

/**
 * The people in an error's `message`, which is the plain-English fallback a
 * non-web client shows. The web app formats the structured `details` instead, so
 * that the order a name is written in stays a decision the UI makes.
 */
export function describeApprovalReferences(references: ApprovalReference[]): string {
  return references
    .map((reference) => `${reference.firstName} ${reference.lastName} (${reference.employeeNumber})`)
    .join(', ');
}

export async function assertEmployeeHasNoApprovalReferences(
  tx: Prisma.TransactionClient,
  input: {
    approverId: string;
    roles?: ApprovalRole[] | undefined;
    code: string;
    message: (employees: string) => string;
  }
): Promise<void> {
  const references = await findApprovalReferences(tx, {
    approverId: input.approverId,
    roles: input.roles,
  });
  if (references.length === 0) return;

  throw new HttpError(409, input.code, input.message(describeApprovalReferences(references)), {
    employees: references,
  });
}

export async function validateEmployeeCanLoseApprovalEligibility(
  tx: Prisma.TransactionClient,
  input: {
    employeeId: string;
    currentStatus: EmployeeStatus;
    nextStatus: EmployeeStatus;
    currentCanBeResponsible: boolean;
    nextCanBeResponsible: boolean;
    currentCanBeSubstituteResponsible: boolean;
    nextCanBeSubstituteResponsible: boolean;
    /**
     * Subject Employee Numbers whose inbound references this caller is rewriting
     * in the same transaction; they are excluded from the DB reference scan so a
     * re-affirmed (or removed) assignment in the same import isn't counted as a
     * conflict. See the import-commit caller.
     */
    ignoreSubjectEmployeeNumbers?: ReadonlySet<number> | undefined;
  }
): Promise<void> {
  if (input.currentStatus === 'ATTIVO' && input.nextStatus !== 'ATTIVO') {
    const references = await findApprovalReferences(tx, {
      approverId: input.employeeId,
      ignoreSubjectEmployeeNumbers: input.ignoreSubjectEmployeeNumbers,
    });
    if (references.length > 0) {
      throw new HttpError(
        409,
        'APPROVER_IN_USE',
        `This employee is an approver for ${describeApprovalReferences(references)}. Remove those approval assignments before making the employee inactive.`,
        { employees: references }
      );
    }
  }

  if (input.currentCanBeResponsible && !input.nextCanBeResponsible) {
    const references = await findApprovalReferences(tx, {
      approverId: input.employeeId,
      roles: ['RESPONSABILE'],
      ignoreSubjectEmployeeNumbers: input.ignoreSubjectEmployeeNumbers,
    });
    if (references.length > 0) {
      throw new HttpError(
        409,
        'RESPONSABILE_APPROVER_IN_USE',
        `This employee is used as Responsabile by ${describeApprovalReferences(references)}. Remove those assignments before disabling Responsabile eligibility.`,
        { employees: references }
      );
    }
  }

  if (input.currentCanBeSubstituteResponsible && !input.nextCanBeSubstituteResponsible) {
    const references = await findApprovalReferences(tx, {
      approverId: input.employeeId,
      roles: ['SUBSTITUTE_RESPONSABILE'],
      ignoreSubjectEmployeeNumbers: input.ignoreSubjectEmployeeNumbers,
    });
    if (references.length > 0) {
      throw new HttpError(
        409,
        'SUBSTITUTE_APPROVER_IN_USE',
        `This employee is used as Sostituto-Responsabile by ${describeApprovalReferences(references)}. Remove those assignments before disabling substitute eligibility.`,
        { employees: references }
      );
    }
  }
}
