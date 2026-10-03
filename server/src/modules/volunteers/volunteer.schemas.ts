import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

// Public self-registration. Every field is re-validated server-side; the
// client (Phase 3 SPA) is never trusted on its own. Volunteer-facing fields
// mirror the old prototype's registration form.
export const registerSchema = z.object({
  branchId: z.string().trim().min(1).max(64),
  englishName: z.string().trim().min(2).max(120),
  arabicName: optionalText(120),
  email: z.string().trim().toLowerCase().max(254).email('Invalid email address.'),
  phone: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .regex(/^[0-9+\s()-]+$/, 'Invalid phone number.'),
  password: z.string().min(8).max(128),
  organization: optionalText(160),
  idNumber: optionalText(64),
  educationInfo: optionalText(500),
  skills: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  certifications: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  applicationAnswers: z
    .array(z.object({ key: z.string().trim().min(1).max(64), answer: z.string().max(1000) }))
    .max(30)
    .optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1).max(256),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const registrationIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export type RegistrationIdParams = z.infer<typeof registrationIdParamsSchema>;

export const listRegistrationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export type ListRegistrationsQuery = z.infer<typeof listRegistrationsQuerySchema>;

// Volunteer-editable profile fields. Identity/email/status are NOT editable by
// the volunteer: emailVerified moves via verification links and identityVerified
// is an administrator verdict. Empty strings normalize to undefined (leave
// unchanged) so a partial PATCH never clears a field the client didn't send.
export const updateVolunteerProfileSchema = z
  .object({
    englishName: z.string().trim().min(1, 'English name is required.').max(120).optional(),
    arabicName: optionalText(120),
    phone: optionalText(40),
    idNumber: optionalText(64),
    organization: optionalText(160),
    educationInfo: optionalText(1000),
    skills: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
    certifications: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  })
  .strict();

export type UpdateVolunteerProfileInput = z.infer<typeof updateVolunteerProfileSchema>;