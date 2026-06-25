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
  }
): Promise<void> {
  if (input.status === 'ATTIVO') {
    if (input.roleIds.responsabileIds.length === 0) {
      throw new HttpError(400, 'RESPONSABILE_REQUIRED', 'Active employees require at least one Responsabile.');
    }
    if (input.roleIds.substituteResponsabileIds.length === 0) {
      throw new HttpError(
        400,
        'SOSTITUTO_RESPONSABILE_REQUIRED',
        'Active employees require at least one Sostituto-Responsabile.'
      );
    }
  }

  const roleEntries = [
    ...input.roleIds.preApproverIds.map((id) => ({ id, role: 'PRE_APPROVER' as const })),
    ...input.roleIds.responsabileIds.map((id) => ({ id, role: 'RESPONSABILE' as const })),
    ...input.roleIds.substituteResponsabileIds.map((id) => ({
      id,
      role: 'SUBSTITUTE_RESPONSABILE' as const,
    })),
  ];
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
    if (approver.status !== 'ATTIVO') {
      throw new HttpError(
        400,
        'APPROVER_MUST_BE_ACTIVE',
        `${approver.firstName} ${approver.lastName} is not an active employee.`
      );
    }
    if (role === 'SUBSTITUTE_RESPONSABILE' && !approver.canBeSubstituteResponsible) {
      throw new HttpError(
        400,
        'APPROVER_NOT_SUBSTITUTE_ELIGIBLE',
        `${approver.firstName} ${approver.lastName} is not marked as Sostituto-Responsabile eligible.`
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
  const data = [
    ...roleIds.preApproverIds.map((approverId) => ({
      employeeId,
      approverId,
      role: 'PRE_APPROVER' as const,
    })),
    ...roleIds.responsabileIds.map((approverId) => ({
      employeeId,
      approverId,
      role: 'RESPONSABILE' as const,
    })),
    ...roleIds.substituteResponsabileIds.map((approverId) => ({
      employeeId,
      approverId,
      role: 'SUBSTITUTE_RESPONSABILE' as const,
    })),
  ];
  if (data.length > 0) {
    await tx.employeeApprovalAssignment.createMany({ data });
  }
}

function referencedEmployeeNumbers(
  references: Array<{
    employee: {
      employeeNumber: number;
    };
  }>
): string {
  return references
    .map((reference) => reference.employee.employeeNumber)
    .sort((left, right) => left - right)
    .join(', ');
}

export async function assertEmployeeHasNoApprovalReferences(
  tx: Prisma.TransactionClient,
  input: {
    approverId: string;
    roles?: ApprovalRole[] | undefined;
    code: string;
    message: (employeeNumbers: string) => string;
  }
): Promise<void> {
  const references = await tx.employeeApprovalAssignment.findMany({
    where: {
      approverId: input.approverId,
      ...(input.roles ? { role: { in: input.roles } } : {}),
    },
    select: {
      employee: {
        select: {
          employeeNumber: true,
        },
      },
    },
  });

  if (references.length === 0) return;

  throw new HttpError(409, input.code, input.message(referencedEmployeeNumbers(references)));
}

export async function validateEmployeeCanLoseApprovalEligibility(
  tx: Prisma.TransactionClient,
  input: {
    employeeId: string;
    currentStatus: EmployeeStatus;
    nextStatus: EmployeeStatus;
    currentCanBeSubstituteResponsible: boolean;
    nextCanBeSubstituteResponsible: boolean;
  }
): Promise<void> {
  if (input.currentStatus === 'ATTIVO' && input.nextStatus !== 'ATTIVO') {
    await assertEmployeeHasNoApprovalReferences(tx, {
      approverId: input.employeeId,
      code: 'APPROVER_IN_USE',
      message: (employeeNumbers) =>
        `This employee is used in approval workflows by Employee Numbers ${employeeNumbers}. Remove those approval assignments before making the employee inactive.`,
    });
  }

  if (input.currentCanBeSubstituteResponsible && !input.nextCanBeSubstituteResponsible) {
    await assertEmployeeHasNoApprovalReferences(tx, {
      approverId: input.employeeId,
      roles: ['SUBSTITUTE_RESPONSABILE'],
      code: 'SUBSTITUTE_APPROVER_IN_USE',
      message: (employeeNumbers) =>
        `This employee is used as Sostituto-Responsabile by Employee Numbers ${employeeNumbers}. Remove those assignments before disabling substitute eligibility.`,
    });
  }
}
