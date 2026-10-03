import { prisma } from '../../lib/prisma';

// The freeze-frame of what "onboarding complete" means. Every check reads real
// persisted data — a missing/empty field can never count as passed, so the
// computed percentage cannot claim 100% while something is actually missing.
// The prototype split identity into "approved photo + approved ID document";
// here those checks are folded into a single explicit administrator verdict
// `identity_verified` (an admin only verifies identity after reviewing the
// volunteer's documents), see docs/QA.md Phase 5 deviations.
export const PROFILE_CHECKS = [
  'englishName',
  'arabicName',
  'idNumber',
  'organization',
  'skills',
  'certifications',
  'educationInfo',
  'applicationAnswers',
  'emailVerified',
  'identityVerified',
] as const;

export type ProfileCheckKey = (typeof PROFILE_CHECKS)[number];

export interface ProfileCompletion {
  percent: number;
  passed: number;
  total: number;
  checks: Record<ProfileCheckKey, boolean>;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyList(values: unknown): boolean {
  return (
    Array.isArray(values) &&
    values.length >= 1 &&
    values.every((value) => nonEmpty(value))
  );
}

// The two ERC questions must both carry a non-empty answer before onboarding
// counts the submission as complete.
function answeredQuestions(values: unknown): boolean {
  return (
    Array.isArray(values) &&
    values.length >= 2 &&
    values.every((value) => !!value && typeof value === 'object' && nonEmpty((value as { answer?: unknown }).answer))
  );
}

export async function computeProfileCompletion(volunteerId: string): Promise<ProfileCompletion | null> {
  const volunteer = await prisma.volunteer.findUnique({
    where: { id: volunteerId },
    select: {
      englishName: true,
      arabicName: true,
      idNumber: true,
      organization: true,
      skills: true,
      certifications: true,
      educationInfo: true,
      applicationAnswers: true,
      emailVerified: true,
      identityVerified: true,
    },
  });
  if (!volunteer) return null;

  const checks: Record<ProfileCheckKey, boolean> = {
    englishName: nonEmpty(volunteer.englishName),
    arabicName: nonEmpty(volunteer.arabicName),
    idNumber: nonEmpty(volunteer.idNumber),
    organization: nonEmpty(volunteer.organization),
    skills: nonEmptyList(volunteer.skills),
    certifications: nonEmptyList(volunteer.certifications),
    educationInfo: nonEmpty(volunteer.educationInfo),
    applicationAnswers: answeredQuestions(volunteer.applicationAnswers),
    emailVerified: volunteer.emailVerified === true,
    identityVerified: volunteer.identityVerified === true,
  };

  const passed = PROFILE_CHECKS.filter((key) => checks[key]).length;
  return {
    percent: Math.round((passed / PROFILE_CHECKS.length) * 100),
    passed,
    total: PROFILE_CHECKS.length,
    checks,
  };
}

export { computeProfileCompletion as getProfileCompletion };