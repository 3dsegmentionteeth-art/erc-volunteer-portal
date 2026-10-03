-- Phase 6.1: service-report credentials — frozen snapshot + per-report revocation.
-- Each verification reference with scope 'service_report' now has exactly one
-- service_reports row carrying the totals that were true at generation time
-- (approved_minutes / record_count / service_day_count) and the report's own
-- revocation state. Public /verify returns these FROZEN numbers, never a live
-- recomputation.

CREATE TABLE "service_reports" (
    "id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL UNIQUE,
    "volunteer_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "approved_minutes" INTEGER NOT NULL,
    "record_count" INTEGER NOT NULL,
    "service_day_count" INTEGER NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "revocation_reason" TEXT,
    CONSTRAINT "service_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_reports_volunteer_id_idx" ON "service_reports"("volunteer_id");
CREATE INDEX "service_reports_branch_id_idx" ON "service_reports"("branch_id");

ALTER TABLE "service_reports"
    ADD CONSTRAINT "service_reports_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_reports"
    ADD CONSTRAINT "service_reports_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_reports"
    ADD CONSTRAINT "service_reports_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "verification_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_reports"
    ADD CONSTRAINT "service_reports_record_count_check" CHECK ("record_count" >= 0);
ALTER TABLE "service_reports"
    ADD CONSTRAINT "service_reports_service_day_count_check" CHECK ("service_day_count" >= 0);