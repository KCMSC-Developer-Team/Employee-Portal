ALTER TABLE "Observation" ADD COLUMN "observationDate" DATE;

UPDATE "Observation"
SET "observationDate" = "createdAt"::DATE
WHERE "observationDate" IS NULL;

ALTER TABLE "Observation"
ALTER COLUMN "observationDate" SET DEFAULT CURRENT_DATE,
ALTER COLUMN "observationDate" SET NOT NULL;

CREATE INDEX "Observation_employeeId_observationDate_idx"
ON "Observation"("employeeId", "observationDate");
