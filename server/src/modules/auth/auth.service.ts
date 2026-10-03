import { hashPassword, verifyPassword } from '../../lib/password';
import { logger } from '../../lib/logger';
import type { SessionActor } from '../../middleware/auth';
import { createAudit, findAdminByIdentifier, findVolunteerByCode, updateAdminLastLogin } from './auth.repository';

type LoginResult =
  | { ok: true; actor: SessionActor; displayName: string; usernameOrCode: string }
  | { ok: false };

// Precomputed dummy hash so a lookup miss burns an Argon2id verification with
// the SAME cost profile as a real account on the very first attempt (a lazy
// memo would make the first miss distinguishable by timing).
const DUMMY_PASSWORD = 'not-the-real-password-placeholder';
const dummyHashPromise = hashPassword(DUMMY_PASSWORD);

export async function loginWithIdentifier(
  identifier: string,
  password: string,
  ip?: string,
): Promise<LoginResult> {
  const admin = await findAdminByIdentifier(identifier);

  if (admin) {
    const valid = await verifyPassword(password, admin.passwordHash).catch(() => false);
    if (!admin.isActive || !valid) return { ok: false };
    await updateAdminLastLogin(admin.id);
    await createAudit({
      actorType: 'admin',
      actorId: admin.id,
      actorName: admin.fullNameEn,
      actorRole: admin.role,
      action: 'auth.login',
      branchId: admin.branchId,
      ipAddress: ip,
    });
    return {
      ok: true,
      displayName: admin.fullNameEn,
      usernameOrCode: admin.username,
      actor: {
        role: 'admin',
        userId: admin.id,
        adminId: admin.id,
        branchId: admin.branchId,
        isHq: admin.role === 'hq_admin',
      },
    };
  }

  const volunteer = await findVolunteerByCode(identifier.toUpperCase());
  if (volunteer) {
    const valid = await verifyPassword(password, volunteer.passwordHash).catch(() => false);
    if (volunteer.status !== 'approved' || !valid) return { ok: false };
    await createAudit({
      actorType: 'volunteer',
      actorId: volunteer.id,
      actorName: volunteer.englishName,
      actorRole: 'volunteer',
      action: 'auth.login',
      branchId: volunteer.branchId,
      ipAddress: ip,
    });
    return {
      ok: true,
      displayName: volunteer.englishName,
      usernameOrCode: volunteer.code,
      actor: {
        role: 'volunteer',
        userId: volunteer.id,
        volunteerId: volunteer.id,
        branchId: volunteer.branchId,
        isHq: false,
      },
    };
  }

  // Lookup miss: burn one argon2 verification to equalize timing.
  await verifyPassword(password, await dummyHashPromise).catch(() => false);
  return { ok: false };
}

export async function auditLoginFailure(identifier: string, ip?: string): Promise<void> {
  logger.warn('Failed login attempt', { identifier, ip });
  await createAudit({
    actorType: 'system',
    action: 'auth.login_failed',
    metadata: { identifier, ip: ip ?? null },
  });
}