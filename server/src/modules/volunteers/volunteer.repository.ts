import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type Tx = Prisma.TransactionClient;

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface RegistrationFilters {
  // null = HQ scope (across branches); set = branch-scoped query.
  branchId: string | null;
  q?: string;
  status?: RegistrationStatus;
  page: number;
  pageSize: number;
}

// Everything a consumer may see or decide on. Password hashes never leave the
// service layer (they are read from the full row only during approval).
export const registrationSelect = {
  id: true,
  branchId: true,
  englishName: true,
  arabicName: true,
  email: true,
  phone: true,
  organization: true,
  idNumber: true,
  skills: true,
  certifications: true,
  educationInfo: true,
  applicationAnswers: true,
  status: true,
  decidedBy: true,
  decidedAt: true,
  volunteerId: true,
  createdAt: true,
} satisfies Prisma.RegistrationSelect;

export type SafeRegistration = Prisma.RegistrationGetPayload<{ select: typeof registrationSelect }>;

export function findBranch(id: string) {
  return prisma.branch.findUnique({ where: { id }, select: { id: true, isActive: true } });
}

// Public catalog for the self-registration form: active branches only.
export function listActiveBranches() {
  return prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { nameEn: 'asc' },
    select: { id: true, code: true, nameEn: true, nameAr: true },
  });
}

export function findVolunteerByEmail(email: string) {
  return prisma.volunteer.findUnique({ where: { email }, select: { id: true } });
}

export function findRegistrationByEmail(email: string) {
  return prisma.registration.findUnique({ where: { email }, select: { id: true } });
}

export async function createRegistration(
  data: Prisma.RegistrationUncheckedCreateInput,
): Promise<SafeRegistration> {
  return prisma.registration.create({ data, select: registrationSelect });
}

export function findRegistrationById(id: string) {
  // Full row (includes password_hash): needed verbatim when approving.
  return prisma.registration.findUnique({ where: { id } });
}

export async function listRegistrations(filters: RegistrationFilters) {
  const where: Prisma.RegistrationWhereInput = {};
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.status) where.status = filters.status;
  if (filters.q) {
    where.OR = [
      { englishName: { contains: filters.q, mode: 'insensitive' } },
      { arabicName: { contains: filters.q, mode: 'insensitive' } },
      { email: { contains: filters.q, mode: 'insensitive' } },
      { phone: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.registration.findMany({
      where,
      select: registrationSelect,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.registration.count({ where }),
  ]);
  return { items, total };
}

export function findRegistrationDetail(id: string) {
  return prisma.registration.findUnique({
    where: { id },
    select: {
      ...registrationSelect,
      branch: { select: { nameEn: true, nameAr: true } },
      volunteer: { select: { code: true, emailVerified: true, status: true } },
    },
  });
}

export async function nextVolunteerCode(tx: Tx): Promise<string> {
  // Highest numeric suffix among ERC-<digits> codes, taken as a bigint so the
  // ordering stays numeric past 4 digits. Codes like ERC-TEST-1 are ignored.
  const rows = await tx.$queryRaw<Array<{ code: string }>>`
    SELECT code
    FROM volunteers
    WHERE code ~ '^ERC-[0-9]+$'
    ORDER BY (substring(code FROM 'ERC-([0-9]+)'))::bigint DESC
    LIMIT 1
  `;
  const last = rows[0]?.code;
  const n = last ? Number(last.split('-')[1]) : 1000;
  return `ERC-${n + 1}`;
}

export function findEmailVerificationByTokenHash(tokenHash: string) {
  return prisma.emailVerification.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { volunteer: true },
  });
}

// Application-access tokens are looked up WITHOUT the used/expired filter so the
// service can distinguish "never existed / belongs to another registration"
// from "expired" for a precise error code.
export function findApplicationAccessToken(tokenHash: string, registrationId: string) {
  return prisma.applicationAccessToken.findFirst({ where: { tokenHash, registrationId } });
}

export function createApplicationAccessToken(
  tx: Tx | typeof prisma,
  registrationId: string,
  tokenHash: string,
  expiresAt: Date,
) {
  return tx.applicationAccessToken.create({
    data: { registrationId, tokenHash, expiresAt },
  });
}

// Burns (single-uses) every outstanding token of a registration. Called inside
// the approve/reject transaction so a token can never be redeemed after a
// decision even if a pending-state check were bypassed.
export function burnRegistrationAccessTokens(tx: Tx, registrationId: string) {
  return tx.applicationAccessToken.updateMany({
    where: { registrationId, usedAt: null },
    data: { usedAt: new Date() },
  });
}

// Everything the volunteer's own profile page shows. Name, contact, identity
// and onboarding-relevant fields only — never the password hash.
export const volunteerProfileSelect = {
  id: true,
  branchId: true,
  code: true,
  englishName: true,
  arabicName: true,
  email: true,
  emailVerified: true,
  identityVerified: true,
  phone: true,
  organization: true,
  educationInfo: true,
  skills: true,
  certifications: true,
  idNumber: true,
  applicationAnswers: true,
  createdAt: true,
} satisfies Prisma.VolunteerSelect;

export function findVolunteerProfile(volunteerId: string) {
  return prisma.volunteer.findUnique({
    where: { id: volunteerId },
    select: volunteerProfileSelect,
  });
}

// Whitelisted PATCH: only the volunteer-editable columns may change. `data` is
// built from a strict zod schema, so unknown/foreign keys never reach Prisma.
export function updateVolunteerProfile(volunteerId: string, data: Prisma.VolunteerUncheckedUpdateInput) {
  return prisma.volunteer.update({
    where: { id: volunteerId },
    data,
    select: volunteerProfileSelect,
  });
}