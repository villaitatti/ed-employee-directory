CREATE TYPE "Language" AS ENUM ('IT', 'EN');

ALTER TABLE "Employee"
  ADD COLUMN "preferredLanguage" "Language" NOT NULL DEFAULT 'IT';

-- workEmail is HR-entered authoritative data with no derivable fallback, so it
-- arrives nullable, gets backfilled from the known roster below, and only then
-- becomes NOT NULL. Deriving an address from firstName/lastName would invent
-- data that mail routing and the Ferie portal's identity key both depend on.
ALTER TABLE "Employee"
  ADD COLUMN "workEmail" TEXT;

UPDATE "Employee" SET "workEmail" = 'acaselli@itatti.harvard.edu' WHERE "employeeNumber" = 201;

-- Any row this migration cannot map has no correct address available, so stop
-- rather than fabricate one. Re-run after adding the missing employee numbers to
-- the backfill above; the transaction leaves the table untouched on abort.
DO $$
DECLARE
  unmapped TEXT;
BEGIN
  SELECT string_agg("employeeNumber"::TEXT, ', ' ORDER BY "employeeNumber")
    INTO unmapped
    FROM "Employee"
   WHERE "workEmail" IS NULL;

  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot backfill Employee.workEmail for employee number(s): %. Add their real addresses to this migration before applying it.',
      unmapped;
  END IF;
END $$;

ALTER TABLE "Employee"
  ALTER COLUMN "workEmail" SET NOT NULL;

CREATE UNIQUE INDEX "Employee_workEmail_key" ON "Employee"("workEmail");
