CREATE TYPE "UsaCategory" AS ENUM ('EXEMPT', 'NON_EXEMPT', 'OTHER');
CREATE TYPE "ContractType" AS ENUM ('INDETERMINATO', 'DETERMINATO', 'CONTRATTO_USA', 'COLLABORATORE');
CREATE TYPE "EmployeeStatus" AS ENUM ('ATTIVO', 'CESSATO', 'DA_ASSUMERE');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'IMPORT_COMMIT');
CREATE TYPE "EntityType" AS ENUM ('EMPLOYEE', 'DEPARTMENT', 'IMPORT_BATCH');
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'COMMITTED', 'SKIPPED', 'ERROR');
CREATE TYPE "ImportProposedAction" AS ENUM ('CREATE', 'UPDATE');

CREATE TABLE "Department" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Employee" (
  "id" TEXT NOT NULL,
  "employeeNumber" INTEGER NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "birthDate" DATE NOT NULL,
  "hireDate" DATE,
  "terminationDate" DATE,
  "retirementDate" DATE NOT NULL,
  "retirementDateOverridden" BOOLEAN NOT NULL DEFAULT false,
  "fte" DECIMAL(4,3) NOT NULL,
  "usaCategory" "UsaCategory" NOT NULL,
  "contractType" "ContractType" NOT NULL,
  "status" "EmployeeStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportBatch" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "actorSub" TEXT NOT NULL,
  "actorEmail" TEXT,
  "rowCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedAt" TIMESTAMP(3),
  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorSub" TEXT NOT NULL,
  "actorEmail" TEXT,
  "entityType" "EntityType" NOT NULL,
  "entityId" TEXT,
  "employeeNumber" INTEGER,
  "action" "AuditAction" NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "requestId" TEXT NOT NULL,
  "importBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "original" JSONB NOT NULL,
  "normalized" JSONB,
  "errors" JSONB NOT NULL,
  "proposedAction" "ImportProposedAction",
  "existingEmployeeId" TEXT,
  "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Department_normalizedName_key" ON "Department"("normalizedName");
CREATE INDEX "Department_name_idx" ON "Department"("name");
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");
CREATE INDEX "Employee_status_idx" ON "Employee"("status");
CREATE INDEX "Employee_updatedAt_idx" ON "Employee"("updatedAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_employeeNumber_idx" ON "AuditLog"("employeeNumber");
CREATE INDEX "AuditLog_actorSub_idx" ON "AuditLog"("actorSub");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_importBatchId_idx" ON "AuditLog"("importBatchId");
CREATE UNIQUE INDEX "ImportRow_batchId_rowNumber_key" ON "ImportRow"("batchId", "rowNumber");
CREATE INDEX "ImportRow_batchId_status_idx" ON "ImportRow"("batchId", "status");

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImportRow"
  ADD CONSTRAINT "ImportRow_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
