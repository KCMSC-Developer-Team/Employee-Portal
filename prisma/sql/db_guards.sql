-- DB-level guards that Prisma cannot express. Applied as a second migration (see README, step 4).
-- Table/column names are Prisma defaults (quoted PascalCase / camelCase).

-- 1. One education row per level, except OTHER (which may repeat)
CREATE UNIQUE INDEX "EducationRecord_staff_level_uniq"
  ON "EducationRecord" ("staffMemberId", "level") WHERE "level" <> 'OTHER';

ALTER TABLE "EducationRecord"
  ADD CONSTRAINT "EducationRecord_year_chk" CHECK ("passingYear" IS NULL OR "passingYear" BETWEEN 1950 AND 2100);

-- 2. Experience: exactly three slots; end not before start (either may be missing in legacy data)
ALTER TABLE "ExperienceRecord"
  ADD CONSTRAINT "ExperienceRecord_slot_chk" CHECK ("slot" BETWEEN 1 AND 3),
  ADD CONSTRAINT "ExperienceRecord_dates_chk" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate");

-- 3. Institution-wide role assignment is unique (NULL department is not covered by the Prisma unique)
CREATE UNIQUE INDEX "UserRole_global_uniq" ON "UserRole" ("userId", "roleId") WHERE "departmentId" IS NULL;

-- 4. At most one PENDING change request per staff member (prevents conflicting concurrent requests)
CREATE UNIQUE INDEX "ChangeRequest_one_pending_uniq" ON "ChangeRequest" ("staffMemberId") WHERE "status" = 'PENDING';

-- 5. Leader roles may hold only leader permissions; ordinary roles may hold none.
CREATE OR REPLACE FUNCTION kcmsc_check_role_permission() RETURNS trigger AS $$
DECLARE r_leader boolean; p_leader boolean;
BEGIN
  SELECT "isLeader" INTO r_leader FROM "Role" WHERE id = NEW."roleId";
  SELECT "isLeader" INTO p_leader FROM "Permission" WHERE id = NEW."permissionId";
  IF r_leader IS DISTINCT FROM p_leader THEN
    RAISE EXCEPTION 'Leader permissions can only attach to Leader roles, and vice versa';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "RolePermission_leader_match"
  BEFORE INSERT OR UPDATE ON "RolePermission"
  FOR EACH ROW EXECUTE FUNCTION kcmsc_check_role_permission();

-- 6. Never delete employee records; audit/revision/status history is append-only.
CREATE OR REPLACE FUNCTION kcmsc_block_delete() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% rows cannot be deleted', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION kcmsc_block_update() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;

CREATE TRIGGER "StaffMember_no_delete" BEFORE DELETE ON "StaffMember" FOR EACH ROW EXECUTE FUNCTION kcmsc_block_delete();
CREATE TRIGGER "LeaderObservation_no_delete" BEFORE DELETE ON "LeaderObservation" FOR EACH ROW EXECUTE FUNCTION kcmsc_block_delete();
CREATE TRIGGER "ObservationRevision_no_delete" BEFORE DELETE ON "ObservationRevision" FOR EACH ROW EXECUTE FUNCTION kcmsc_block_delete();
CREATE TRIGGER "ObservationRevision_no_update" BEFORE UPDATE ON "ObservationRevision" FOR EACH ROW EXECUTE FUNCTION kcmsc_block_update();
CREATE TRIGGER "AuditEvent_no_delete" BEFORE DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION kcmsc_block_delete();
CREATE TRIGGER "AuditEvent_no_update" BEFORE UPDATE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION kcmsc_block_update();
CREATE TRIGGER "EmploymentStatusEvent_no_delete" BEFORE DELETE ON "EmploymentStatusEvent" FOR EACH ROW EXECUTE FUNCTION kcmsc_block_delete();
CREATE TRIGGER "EmploymentStatusEvent_no_update" BEFORE UPDATE ON "EmploymentStatusEvent" FOR EACH ROW EXECUTE FUNCTION kcmsc_block_update();
