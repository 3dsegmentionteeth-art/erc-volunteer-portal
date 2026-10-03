import { hashPassword } from '../src/lib/password';
import { prisma } from '../src/lib/prisma';

// Development/demo seed: one headquarters branch, one HQ admin, one demo
// branch admin. NEVER run against production with the demo credentials
// (see docs/SECURITY.md — change secrets + admin passwords before deploy).

const SEED_ADMIN_PASSWORD = 'admin123!';
// Demo volunteer credentials — dev/test only, documented in docs/SECURITY.md.
const SEED_VOLUNTEER_PASSWORD = 'volunteer-pass-123';

async function main(): Promise<void> {
  const branch = await prisma.branch.upsert({
    where: { code: 'ERC-HQ' },
    update: {},
    create: {
      code: 'ERC-HQ',
      nameEn: 'Headquarters',
      nameAr: 'المقر الرئيسي',
    },
  });

  const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);

  const hq = await prisma.admin.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      fullNameEn: 'Headquarters Administrator',
      fullNameAr: 'مدير المقر الرئيسي',
      email: 'admin@erc.local',
      passwordHash,
      role: 'hq_admin',
      branchId: null,
    },
  });

  await prisma.admin.upsert({
    where: { username: 'branch-admin' },
    update: {},
    create: {
      username: 'branch-admin',
      fullNameEn: 'Demo Branch Administrator',
      fullNameAr: 'مدير فرع تجريبي',
      email: 'branch-admin@erc.local',
      passwordHash,
      role: 'branch_admin',
      branchId: branch.id,
    },
  });

  // A fully-usable demo volunteer: approved + email-verified + identity
  // verified, with every profile-completion field filled (skills,
  // certifications, educationInfo, 2 application answers) so the 100%
  // onboarding gate (Phase 5) is open and time requests work immediately.
  // Code and password known, branch-assigned. NEVER seed production.
  const volunteerPasswordHash = await hashPassword(SEED_VOLUNTEER_PASSWORD);
  const demoVolunteer = {
    branchId: branch.id,
    code: 'ERC-1000',
    englishName: 'Demo Volunteer',
    arabicName: 'متطوع تجريبي',
    email: 'volunteer@erc.local',
    emailVerified: true,
    identityVerified: true,
    phone: '+201000000000',
    passwordHash: volunteerPasswordHash,
    status: 'approved',
    approvedAt: new Date(),
    organization: 'Teba Hospital',
    idNumber: '29909129999999',
    educationInfo: 'B.Sc. Nursing, Cairo University (2022).',
    skills: ['First Aid', 'Patient Transport', 'Arabic-English Translation'],
    certifications: ['Basic Life Support (BLS)'],
    applicationAnswers: [
      { key: 'why', answer: 'To serve the community around me.' },
      { key: 'benefit', answer: 'Something meaningful to do.' },
    ],
  };
  await prisma.volunteer.upsert({
    where: { code: 'ERC-1000' },
    // Re-running the seed upgrades an existing row to the complete profile so
    // older local databases match the Phase 5 gate expectations.
    update: {
      identityVerified: true,
      educationInfo: demoVolunteer.educationInfo,
      skills: demoVolunteer.skills,
      certifications: demoVolunteer.certifications,
      emailVerified: true,
    },
    create: demoVolunteer,
  });

  // Back the identity verdict with the document it stands for: production
  // id_document rows attach to the pending registration and are approved
  // before the identity verdict (Phase 5.1 enforcement). Mirror that path for
  // the seeded account so the 100% gate stays satisfiable for ERC-1000.
  const volunteerRow = await prisma.volunteer.findUniqueOrThrow({ where: { code: 'ERC-1000' } });
  const registration = await prisma.registration.upsert({
    where: { email: demoVolunteer.email },
    update: { volunteerId: volunteerRow.id },
    create: {
      branchId: branch.id,
      englishName: demoVolunteer.englishName,
      arabicName: demoVolunteer.arabicName ?? undefined,
      email: demoVolunteer.email,
      phone: demoVolunteer.phone ?? '+201000000000',
      passwordHash: volunteerPasswordHash,
      organization: demoVolunteer.organization ?? undefined,
      idNumber: demoVolunteer.idNumber ?? undefined,
      status: 'approved',
      volunteerId: volunteerRow.id,
    },
  });
  await prisma.volunteer.update({ where: { id: volunteerRow.id }, data: { registrationId: registration.id } });
  await prisma.document.deleteMany({ where: { registrationId: registration.id } });
  await prisma.document.create({
    data: {
      registrationId: registration.id,
      branchId: branch.id,
      objectKey: `registrations/${registration.id}/seed-id-document`,
      originalName: 'national-id.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 0,
      category: 'id_document',
      status: 'approved',
    },
  });

  console.log(
    `Seeded branch "${branch.code}", admin accounts, and demo volunteer ERC-1000 (password: ${SEED_VOLUNTEER_PASSWORD}). HQ admin id: ${hq.id}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());