// Phase 6.2 deployment backfill: create a frozen service-report snapshot for
// every verification reference issued before the frozen-snapshot trust model
// (i.e. any scope='service_report' reference with no service_reports row), so
// no pre-6.1 printed/QR credential silently resolves to the uniform-404.
//
// The snapshot is frozen from the volunteer's LIVE ledger totals at the moment
// this script runs — the decided remediation in docs/SECURITY.md
// ("Service-report backfill decision"). It is an honest approximation of what
// the ledger means today, not a reconstruction of what was true on issue day.
//
// Reasons this is a Node script rather than SQL migration content: the
// snapshot derivation must stay a SINGLE source of truth with live report
// generation (deriveSnapshot in the reporting service), and the script is
// idempotent — it only ever touches references that still have no report row.
//
// Run AFTER `prisma migrate deploy` (which adds snapshot_origin) and BEFORE
// exposing the app:
//   dev:   npm run db:backfill
//   prod:  node dist/scripts/backfill-service-reports.js
//
// Re-running is safe (no-op once every ref has a snapshot row).
import { prisma } from '../lib/prisma';
import {
  BACKFILL_MIGRATION_NAME,
  SNAPSHOT_ORIGIN_BACKFILL,
  backfillServiceReportsFromLiveTotals,
} from '../modules/reporting/reporting.service';

async function main(): Promise<void> {
  const startedAt = new Date();
  const result = await backfillServiceReportsFromLiveTotals();
  console.log(
    JSON.stringify(
      {
        origin: SNAPSHOT_ORIGIN_BACKFILL,
        migration: BACKFILL_MIGRATION_NAME,
        ranAt: startedAt.toISOString(),
        ...result,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('service-report backfill failed:', error);
  await prisma.$disconnect();
  process.exitCode = 1;
});