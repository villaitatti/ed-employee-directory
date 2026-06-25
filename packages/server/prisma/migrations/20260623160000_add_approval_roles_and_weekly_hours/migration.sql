CREATE TYPE "ApprovalRole" AS ENUM ('PRE_APPROVER', 'RESPONSABILE', 'SUBSTITUTE_RESPONSABILE');

ALTER TABLE "Employee"
  ADD COLUMN "canBeSubstituteResponsible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mondayMinutes" INTEGER NOT NULL DEFAULT 450,
  ADD COLUMN "tuesdayMinutes" INTEGER NOT NULL DEFAULT 450,
  ADD COLUMN "wednesdayMinutes" INTEGER NOT NULL DEFAULT 450,
  ADD COLUMN "thursdayMinutes" INTEGER NOT NULL DEFAULT 450,
  ADD COLUMN "fridayMinutes" INTEGER NOT NULL DEFAULT 450;

CREATE TABLE "EmployeeApprovalAssignment" (
  "employeeId" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "role" "ApprovalRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeApprovalAssignment_pkey" PRIMARY KEY ("employeeId", "approverId", "role")
);

CREATE INDEX "Employee_canBeSubstituteResponsible_status_idx" ON "Employee"("canBeSubstituteResponsible", "status");
CREATE INDEX "EmployeeApprovalAssignment_approverId_idx" ON "EmployeeApprovalAssignment"("approverId");
CREATE INDEX "EmployeeApprovalAssignment_role_idx" ON "EmployeeApprovalAssignment"("role");

ALTER TABLE "EmployeeApprovalAssignment"
  ADD CONSTRAINT "EmployeeApprovalAssignment_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeApprovalAssignment"
  ADD CONSTRAINT "EmployeeApprovalAssignment_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
