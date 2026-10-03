import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';

export const ADMIN_PASSWORD = 'admin123!';

export async function resetDb(): Promise<void> {
  // The audit-log TRUNCATE guard must be lifted for test cleanup; this needs
  // DB TRIGGER privilege and is intentionally NOT reachable through the API.
  await prisma.$executeRawUnsafe('ALTER TABLE "audit_logs" DISABLE TRIGGER trg_audit_logs_no_truncate;');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs";');
  await prisma.$executeRawUnsafe('ALTER TABLE "audit_logs" ENABLE TRIGGER trg_audit_logs_no_truncate;');
  await prisma.$executeRawUnsafe('DELETE FROM "session";');
  await prisma.$transaction([
    prisma.applicationAccessToken.deleteMany(),
    prisma.emailVerification.deleteMany(),
    prisma.serviceReport.deleteMany(),
    prisma.verificationReference.deleteMany(),
    prisma.adminTimeAdjustment.deleteMany(),
    prisma.timeEditRequest.deleteMany(),
    prisma.timeAddRequest.deleteMany(),
    prisma.serviceTimeRecord.deleteMany(),
    prisma.document.deleteMany(),
    prisma.registration.deleteMany(),
    prisma.volunteer.deleteMany(),
    prisma.admin.deleteMany(),
    prisma.branch.deleteMany(),
  ]);
}

export interface AuthFixtures {
  branchId: string;
  hqAdminId: string;
  branchAdminId: string;
  volunteerId: string;
  volunteerCode: string;
}

export async function seedAuthFixtures(): Promise<AuthFixtures> {
  await resetDb();
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const branch = await prisma.branch.create({
    data: { code: 'ERC-HQ', nameEn: 'Headquarters', nameAr: 'المقر الرئيسي' },
  });
  const hq = await prisma.admin.create({
    data: {
      username: 'admin',
      fullNameEn: 'HQ Admin',
      email: 'admin@erc.local',
      passwordHash,
      role: 'hq_admin',
      branchId: null,
    },
  });
  const branchAdmin = await prisma.admin.create({
    data: {
      username: 'branch-admin',
      fullNameEn: 'Branch Admin',
      email: 'branch-admin@erc.local',
      passwordHash,
      role: 'branch_admin',
      branchId: branch.id,
    },
  });
  const volunteer = await prisma.volunteer.create({
    data: {
      branchId: branch.id,
      code: 'ERC-TEST-1',
      englishName: 'Volunteer One',
      email: 'volunteer1@erc.local',
      passwordHash,
      status: 'approved',
      organization: 'Teba Hospital',
      idNumber: '29909123456789',
    },
  });
  return {
    branchId: branch.id,
    hqAdminId: hq.id,
    branchAdminId: branchAdmin.id,
    volunteerId: volunteer.id,
    volunteerCode: volunteer.code,
  };
}