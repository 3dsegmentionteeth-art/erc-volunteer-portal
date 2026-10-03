import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { config } from '../../config';
import { ApiError, conflict, notFound } from '../../lib/http';
import { sendApplicationAccessEmail, sendVerificationEmail } from '../../lib/mailer';
import { hashPassword } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import type { SessionActor } from '../../middleware/auth';
import { createAudit } from '../auth/auth.repository';
import type { RegisterInput, UpdateVolunteerProfileInput } from './volunteer.schemas';
import {
  burnRegistrationAccessTokens,
  createApplicationAccessToken,
  createRegistration,
  findApplicationAccessToken,
  findBranch,
  findEmailVerificationByTokenHash,
  findRegistrationByEmail,
  findRegistrationById,
  findRegistrationDetail,
  findVolunteerByEmail,
  findVolunteerProfile,
  listActiveBranches,
  listRegistrations,
  nextVolunteerCode,
  registrationSelect,
  updateVolunteerProfile as updateVolunteerProfileRow,
  type RegistrationFilters,
  type SafeRegistration,
  type Tx,
} from './volunteer.repository';
import { computeProfileCompletion } from './profile';

function assertAdminBranchScope(actor: SessionActor, branchId: string): void {
  // Fail closed: a branch admin can only act on resources of their own branch.
  if (actor.role === 'admin' && !actor.isHq && actor.branchId !== branchId) {
    throw new ApiError(403, 'This resource belongs to another branch.', 'BRANCH_SCOPE_VIOLATION');
  }
}

function adminAuditBase(actor: SessionActor) {
  return {
    actorType: 'admin' as const,
    actorId: actor.adminId,
    actorName: actor.displayName,
    actorRole: actor.role,
  };
}

// Public catalog consumed by the self-registration form's branch selector.
export function listBranches() {
  return listActiveBranches();
}

export async function registerVolunteer(input: RegisterInput, ip?: string): Promise<SafeRegistration> {
  const branch = await findBranch(input.branchId);
  if (!branch) throw new ApiError(400, 'Unknown branch.', 'INVALID_BRANCH');
  if (!branch.isActive) {
    throw new ApiError(400, 'This branch is not accepting volunteers right now.', 'BRANCH_INACTIVE');
  }

  const emailTaken =
    (await findVolunteerByEmail(input.email)) ?? (await findRegistrationByEmail(input.email));
  if (emailTaken) throw conflict('This email is already registered.', 'EMAIL_ALREADY_REGISTERED');

  const passwordHash = await hashPassword(input.password);
  try {
    const registration = await createRegistration({
      branchId: input.branchId,
      englishName: input.englishName,
      arabicName: input.arabicName ?? null,
      email: input.email,
      phone: input.phone,
      passwordHash,
      organization: input.organization ?? null,
      idNumber: input.idNumber ?? null,
      educationInfo: input.educationInfo ?? null,
      skills: input.skills ?? Prisma.JsonNull,
      certifications: input.certifications ?? Prisma.JsonNull,
      applicationAnswers: input.applicationAnswers ?? Prisma.JsonNull,
    });
    await createAudit({
      actorType: 'system',
      action: 'registration.created',
      targetType: 'registration',
      targetId: registration.id,
      branchId: registration.branchId,
      ipAddress: ip,
      metadata: { email: registration.email, englishName: registration.englishName },
    });
    // Issue the applicant a short-lived, single-use access token so they can
    // attach documents to this still-pending registration. Only the digest is
    // stored; the raw token goes out via the (test/stream, SMTP, or log-only)
    // mailer — never persisted, never returned by an endpoint.
    const accessToken = await issueApplicationAccessToken(prisma, registration.id);
    await sendApplicationAccessEmail({
      to: registration.email,
      name: registration.englishName,
      registrationId: registration.id,
      token: accessToken,
    });
    return registration;
  } catch (err) {
    // A concurrent submission can still race onto the unique email index.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('This email is already registered.', 'EMAIL_ALREADY_REGISTERED');
    }
    throw err;
  }
}

export async function listAdminRegistrations(actor: SessionActor, filters: Omit<RegistrationFilters, 'branchId'>) {
  const branchId = actor.role === 'admin' && !actor.isHq ? actor.branchId : null;
  const { items, total } = await listRegistrations({ ...filters, branchId });
  return {
    items,
    meta: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
  };
}

export async function getRegistration(actor: SessionActor, registrationId: string) {
  const registration = await findRegistrationDetail(registrationId);
  if (!registration) throw notFound('Registration not found.');
  assertAdminBranchScope(actor, registration.branchId);
  return registration;
}

export async function approveRegistration(
  actor: SessionActor,
  registrationId: string,
  ip?: string,
): Promise<{ ok: boolean; volunteerId: string; code: string }> {
  const registration = await findRegistrationById(registrationId);
  if (!registration) throw notFound('Registration not found.');
  assertAdminBranchScope(actor, registration.branchId);
  if (registration.status !== 'pending' || registration.volunteerId) {
    throw conflict('This registration has already been decided.', 'REGISTRATION_ALREADY_DECIDED');
  }

  // Volunteer code allocation is read-then-write; a concurrent approval could
  // collide on the unique code index, so retry the whole transaction (audit
  // rows roll back with their transaction — they only persist on success).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const volunteer = await prisma.$transaction(async (tx) => {
        const code = await nextVolunteerCode(tx);
        const created = await tx.volunteer.create({
          data: {
            branchId: registration.branchId,
            code,
            englishName: registration.englishName,
            arabicName: registration.arabicName,
            email: registration.email,
            phone: registration.phone,
            passwordHash: registration.passwordHash,
            organization: registration.organization,
            educationInfo: registration.educationInfo,
            skills: registration.skills ?? Prisma.JsonNull,
            certifications: registration.certifications ?? Prisma.JsonNull,
            idNumber: registration.idNumber,
            applicationAnswers: registration.applicationAnswers ?? Prisma.JsonNull,
            status: 'approved',
            approvedAt: new Date(),
            registrationId: registration.id,
          },
        });
        await tx.registration.update({
          where: { id: registration.id },
          data: { status: 'approved', decidedBy: actor.adminId, decidedAt: new Date(), volunteerId: created.id },
        });
        await createAudit(
          {
            ...adminAuditBase(actor),
            action: 'registration.approved',
            targetType: 'registration',
            targetId: registration.id,
            branchId: registration.branchId,
            ipAddress: ip,
            metadata: { volunteerCode: code },
          },
          tx,
        );
        // The registration is decided: the application-access token can never
        // be redeemed again (single-use at the registration-life level).
        await burnRegistrationAccessTokens(tx, registration.id);
        return created;
      });
      const token = await issueVerificationToken(prisma, volunteer.id);
      // Deliver (or, in dev, log) the one-time link so the applicant can verify.
      await sendVerificationEmail({ to: volunteer.email, name: volunteer.englishName, token });
      return { ok: true, volunteerId: volunteer.id, code: volunteer.code };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
      throw err;
    }
  }
  throw conflict('Could not allocate a unique volunteer code.', 'VOLUNTEER_CODE_COLLISION');
}

export async function rejectRegistration(actor: SessionActor, registrationId: string, ip?: string) {
  const registration = await findRegistrationById(registrationId);
  if (!registration) throw notFound('Registration not found.');
  assertAdminBranchScope(actor, registration.branchId);
  if (registration.status !== 'pending') {
    throw conflict('This registration has already been decided.', 'REGISTRATION_ALREADY_DECIDED');
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { status: 'rejected', decidedBy: actor.adminId, decidedAt: new Date() },
      select: registrationSelect,
    });
    await createAudit(
      {
        ...adminAuditBase(actor),
        action: 'registration.rejected',
        targetType: 'registration',
        targetId: registration.id,
        branchId: registration.branchId,
        ipAddress: ip,
      },
      tx,
    );
    // Single-use: an application-access token can never be redeemed after the
    // registration leaves the pending state.
    await burnRegistrationAccessTokens(tx, registration.id);
    return updated;
  });
}

export async function verifyVolunteerEmail(token: string, ip?: string) {
  const record = await findEmailVerificationByTokenHash(hashToken(token));
  if (!record) {
    throw new ApiError(400, 'Verification token is invalid or expired.', 'INVALID_VERIFICATION_TOKEN');
  }
  await prisma.$transaction(async (tx) => {
    await tx.emailVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.volunteer.update({ where: { id: record.volunteerId }, data: { emailVerified: true } });
    await createAudit(
      {
        actorType: 'volunteer',
        actorId: record.volunteerId,
        actorName: record.volunteer.englishName,
        actorRole: 'volunteer',
        action: 'auth.email_verified',
        targetType: 'volunteer',
        targetId: record.volunteerId,
        branchId: record.volunteer.branchId,
        ipAddress: ip,
      },
      tx,
    );
  });
  return { ok: true, email: record.volunteer.email };
}

export async function resendVolunteerVerification(actor: SessionActor, ip?: string) {
  const volunteer = await prisma.volunteer.findUnique({
    where: { id: actor.volunteerId },
    select: { id: true, email: true, englishName: true, branchId: true },
  });
  if (!volunteer) throw notFound('Volunteer not found.');

  const token = await prisma.$transaction(async (tx) => {
    // Only one active token at a time: burn outstanding ones first.
    await tx.emailVerification.updateMany({
      where: { volunteerId: volunteer.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return issueVerificationToken(tx, volunteer.id);
  });
  await sendVerificationEmail({ to: volunteer.email, name: volunteer.englishName, token });
  await createAudit({
    actorType: 'volunteer',
    actorId: volunteer.id,
    actorName: volunteer.englishName,
    actorRole: 'volunteer',
    action: 'auth.email_verification_resent',
    targetType: 'volunteer',
    targetId: volunteer.id,
    branchId: volunteer.branchId,
    ipAddress: ip,
  });
  return { ok: true };
}

function requireVolunteerId(actor: SessionActor): string {
  // requireAuth('volunteer') guarantees this in practice; fail closed for any
  // future path that reaches the profile service without a volunteer subject.
  if (!actor.volunteerId) {
    throw new ApiError(403, 'You do not have permission for this action.', 'FORBIDDEN');
  }
  return actor.volunteerId;
}

export async function getVolunteerProfile(actor: SessionActor) {
  const volunteerId = requireVolunteerId(actor);
  const profile = await findVolunteerProfile(volunteerId);
  if (!profile) throw notFound('Volunteer not found.');
  const completion = await computeProfileCompletion(volunteerId);
  return { profile, completion };
}

// The volunteer edits their own identity/education/skills rows. The form sends
// defined values; empty STRING fields are left unchanged ('' normalizes to
// undefined by the schema) while an explicit empty ARRAY clears a skills/
// certifications list. Email verification and identity verification are never
// touched from here.
export async function updateVolunteerProfile(actor: SessionActor, input: UpdateVolunteerProfileInput, ip?: string) {
  const volunteerId = requireVolunteerId(actor);
  const current = await findVolunteerProfile(volunteerId);
  if (!current) throw notFound('Volunteer not found.');

  const data: Prisma.VolunteerUncheckedUpdateInput = {};
  if (input.englishName !== undefined) data.englishName = input.englishName;
  if (input.arabicName !== undefined) data.arabicName = input.arabicName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.idNumber !== undefined) data.idNumber = input.idNumber;
  if (input.organization !== undefined) data.organization = input.organization;
  if (input.educationInfo !== undefined) data.educationInfo = input.educationInfo;
  if (input.skills !== undefined) data.skills = input.skills.length > 0 ? input.skills : Prisma.JsonNull;
  if (input.certifications !== undefined) data.certifications = input.certifications.length > 0 ? input.certifications : Prisma.JsonNull;

  const changedFields = Object.keys(data);
  let profile = current;
  if (changedFields.length > 0) {
    profile = await updateVolunteerProfileRow(volunteerId, data);
    await createAudit({
      actorType: 'volunteer',
      actorId: volunteerId,
      actorName: actor.displayName,
      actorRole: 'volunteer',
      action: 'volunteer.profile_updated',
      targetType: 'volunteer',
      targetId: volunteerId,
      branchId: current.branchId,
      ipAddress: ip,
      metadata: { fields: changedFields },
    });
  }
  const completion = await computeProfileCompletion(volunteerId);
  return { profile, completion };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Stores only the digest; the raw token is returned to the caller so the
// verification email can be composed — it is never persisted or returned by an
// endpoint.
async function issueVerificationToken(tx: Tx | typeof prisma, volunteerId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await tx.emailVerification.create({
    data: {
      volunteerId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + config.auth.emailVerificationTtlMs),
    },
  });
  return token;
}

// Same pattern as the email-verification token, but bound to a *pending*
// registration (the applicant's self-attestation for document upload/delete).
async function issueApplicationAccessToken(tx: Tx | typeof prisma, registrationId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await createApplicationAccessToken(
    tx,
    registrationId,
    hashToken(token),
    new Date(Date.now() + config.auth.applicationAccessTokenTtlMs),
  );
  return token;
}

// Enforces the applicant's application-access token on public document
// operations. The look-up is deliberately UNfiltered on used/expiry so each
// failure maps to a distinct 403 code (missing / invalid / consumed / expired).
// Single-use is registration-lifecycle-scoped: not burned per HTTP request
// (an applicant attaches multiple files from one emailed link) but burned
// atomically when the registration is decided (see burnRegistrationAccessTokens).
export async function assertApplicationAccessToken(registrationId: string, token: unknown): Promise<void> {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new ApiError(403, 'Application access token is required.', 'APPLICATION_ACCESS_TOKEN_MISSING');
  }
  const record = await findApplicationAccessToken(hashToken(token.trim()), registrationId);
  if (!record) {
    throw new ApiError(403, 'Application access token is invalid.', 'APPLICATION_ACCESS_TOKEN_INVALID');
  }
  if (record.usedAt) {
    throw new ApiError(403, 'Application access token was already consumed.', 'APPLICATION_ACCESS_TOKEN_INVALID');
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(403, 'Application access token has expired.', 'APPLICATION_ACCESS_TOKEN_EXPIRED');
  }
}