import { z } from 'zod';

export const loginSchema = z.object({
  // Admin username or volunteer code (e.g. ERC-1001). Resolved server-side.
  identifier: z
    .string()
    .trim()
    .min(2, 'Identifier must be at least 2 characters.')
    .max(64, 'Identifier is too long.')
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
});

export type LoginInput = z.infer<typeof loginSchema>;