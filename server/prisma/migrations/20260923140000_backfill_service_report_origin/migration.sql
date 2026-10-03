-- Phase 6.2: snapshot provenance for service_reports.
--
-- Pre-6.1 verification references have no service_reports row, so any report
-- issued before the frozen-snapshot change resolves to the same uniform 404 as
-- unknown/revoked. The decided remediation backfills those refs from *live*
-- ledger totals at migration time (a documented approximation, see
-- docs/SECURITY.md "Service-report backfill decision"). This migration only
-- adds the provenance column; the data backfill is a reproducible Node script
-- (src/scripts/backfill-service-reports.ts via the reporting service) so the
-- snapshot derivation stays a single source of truth with report generation.
--
-- snapshot_origin: NULL for reports issued live through the API;
-- 'migration-live-backfill' for rows created by the backfill script.

ALTER TABLE "service_reports"
    ADD COLUMN "snapshot_origin" TEXT;

ALTER TABLE "service_reports"
    ADD CONSTRAINT "service_reports_snapshot_origin_check"
    CHECK ("snapshot_origin" IS NULL OR "snapshot_origin" = 'migration-live-backfill');