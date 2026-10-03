-- DB-level hardening that Prisma's schema DSL does not express natively.
-- Status/lifecycle columns are free TEXT in schema.prisma on purpose; the
-- allowed values are enforced here by PostgreSQL CHECK constraints, NOT just
-- by application validation. See docs/ARCHITECTURE.md "Database constraints".

-- ---------------------------------------------------------------------------
-- 1) connect-pg-simple session table (server-side sessions live in Postgres)
-- ---------------------------------------------------------------------------
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL COLLATE "default",
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX "IDX_session_expire" ON "session" ("expire");

-- ---------------------------------------------------------------------------
-- 2) CHECK constraints
-- ---------------------------------------------------------------------------

-- Admins: role must be branch_admin or hq_admin
ALTER TABLE "admins"
    ADD CONSTRAINT "admins_role_check" CHECK ("role" IN ('branch_admin', 'hq_admin'));

-- HQ admins are the only admins allowed to have a NULL branch_id.
-- A branch_admin MUST belong to a branch; an hq_admin MUST NOT.
ALTER TABLE "admins"
    ADD CONSTRAINT "admins_branch_scope_check"
    CHECK (
        ("role" = 'branch_admin' AND "branch_id" IS NOT NULL)
        OR ("role" = 'hq_admin' AND "branch_id" IS NULL)
    );

-- Registration lifecycle
ALTER TABLE "registrations"
    ADD CONSTRAINT "registrations_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected'));

ALTER TABLE "registrations"
    ADD CONSTRAINT "registrations_email_format_check"
    CHECK ("email" ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Volunteers lifecycle + email format
ALTER TABLE "volunteers"
    ADD CONSTRAINT "volunteers_status_check"
    CHECK ("status" IN ('approved', 'rejected'));

ALTER TABLE "volunteers"
    ADD CONSTRAINT "volunteers_email_format_check"
    CHECK ("email" ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Official service-time records: signed, nonzero minutes. Negative values are
-- legitimate (official admin subtractions); volunteer-facing requests enforce
-- positivity at the request layer. Records are never written directly by a
-- volunteer (no create endpoint exposes them).
ALTER TABLE "service_time_records"
    ADD CONSTRAINT "service_time_records_minutes_check" CHECK ("minutes" <> 0);

ALTER TABLE "service_time_records"
    ADD CONSTRAINT "service_time_records_source_check"
    CHECK ("source" IN ('add_request', 'admin_adjustment', 'seed'));

ALTER TABLE "service_time_records"
    ADD CONSTRAINT "service_time_records_event_check" CHECK (btrim("event") <> '');

-- Time-add requests
ALTER TABLE "time_add_requests"
    ADD CONSTRAINT "time_add_requests_minutes_check" CHECK ("minutes" > 0);

ALTER TABLE "time_add_requests"
    ADD CONSTRAINT "time_add_requests_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected'));

ALTER TABLE "time_add_requests"
    ADD CONSTRAINT "time_add_requests_event_check" CHECK (btrim("event") <> '');

-- Time-edit requests: requested values must be valid and a reason is REQUIRED
ALTER TABLE "time_edit_requests"
    ADD CONSTRAINT "time_edit_requests_minutes_check" CHECK ("requested_minutes" > 0);

ALTER TABLE "time_edit_requests"
    ADD CONSTRAINT "time_edit_requests_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected'));

ALTER TABLE "time_edit_requests"
    ADD CONSTRAINT "time_edit_requests_reason_check"
    CHECK (btrim("reason") <> '');

ALTER TABLE "time_edit_requests"
    ADD CONSTRAINT "time_edit_requests_event_check" CHECK (btrim("requested_event") <> '');

-- Admin adjustments: signed nonzero delta; reason REQUIRED server-side and DB-side
ALTER TABLE "admin_time_adjustments"
    ADD CONSTRAINT "admin_time_adjustments_delta_check" CHECK ("delta_minutes" <> 0);

ALTER TABLE "admin_time_adjustments"
    ADD CONSTRAINT "admin_time_adjustments_reason_check"
    CHECK (btrim("reason") <> '');

-- Documents: category/status vocab + EXACTLY ONE owner (volunteer XOR registration)
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_category_check"
    CHECK ("category" IN ('photo', 'id_document', 'certificate', 'other'));

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected'));

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_owner_check"
    CHECK (
        ("volunteer_id" IS NOT NULL)::integer + ("registration_id" IS NOT NULL)::integer = 1
    );

-- Verification references: scope vocabulary
ALTER TABLE "verification_references"
    ADD CONSTRAINT "verification_references_scope_check"
    CHECK ("scope" IN ('service_report', 'admin_log'));

-- Audit log actor type vocabulary
ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_actor_type_check"
    CHECK ("actor_type" IN ('admin', 'volunteer', 'system'));

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_action_check" CHECK (btrim("action") <> '');

-- ---------------------------------------------------------------------------
-- 3) Anti-duplicate guards (double-approval / double-submission safety nets)
-- ---------------------------------------------------------------------------

-- At most ONE pending add request for the same volunteer/date/event/minutes.
-- Approval flips status out of 'pending' first inside a transaction, so a
-- second approval of the same request is a no-op.
CREATE UNIQUE INDEX "time_add_requests_no_duplicate_pending"
    ON "time_add_requests" ("volunteer_id", "date", "event", "minutes")
    WHERE "status" = 'pending';

-- At most ONE pending edit request per service-time record. This is the DB-level
-- backstop for the "double-approval must not double-credit" requirement.
CREATE UNIQUE INDEX "time_edit_requests_one_pending_per_record"
    ON "time_edit_requests" ("record_id")
    WHERE "status" = 'pending';

-- ---------------------------------------------------------------------------
-- 4) Audit log append-only enforcement (INSERT/… SELECT only, no UPDATE/DELETE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_logs_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only: UPDATE/DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_append_only
    BEFORE UPDATE OR DELETE ON "audit_logs"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_logs_append_only();