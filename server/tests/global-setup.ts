import { execSync } from 'child_process';
import { Pool } from 'pg';

const DEV_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://erc:erc_dev_password@localhost:5432/erc_portal?schema=public';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://erc:erc_dev_password@localhost:5432/erc_portal_test?schema=public';

// Phase 1 runs integration tests against a REAL Postgres (no mocking). This
// creates a dedicated test database and applies the real migrations to it.
export default async function globalSetup(): Promise<void> {
  const admin = new Pool({ connectionString: DEV_DATABASE_URL });
  try {
    await admin.query('CREATE DATABASE erc_portal_test');
  } catch {
    // already exists
  }
  await admin.end();

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}