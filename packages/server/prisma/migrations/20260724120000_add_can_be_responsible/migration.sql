ALTER TABLE "Employee"
  ADD COLUMN "canBeResponsible" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: anyone already assigned as a RESPONSABILE approver must remain
-- selectable as one, so mark them eligible. Without this, existing responsabili
-- would vanish from the (now filtered) Responsabile dropdown and the "can't
-- disable while in use" guard would have nothing to protect.
UPDATE "Employee"
SET "canBeResponsible" = true
WHERE "id" IN (
  SELECT DISTINCT "approverId"
  FROM "EmployeeApprovalAssignment"
  WHERE "role" = 'RESPONSABILE'
);

CREATE INDEX "Employee_canBeResponsible_status_idx" ON "Employee"("canBeResponsible", "status");
