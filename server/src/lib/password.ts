import { Algorithm, hash, verify } from '@node-rs/argon2';

// OWASP Argon2id recommendation (as of writing): memory 19 MiB, iterations 2,
// parallelism 1, output 32 bytes. Parameters are encoded in the PHC string, so
// they can be raised in the future without breaking existing hashes.
const ARGON2ID_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2ID_OPTIONS);
}

export async function verifyPassword(plain: string, encodedHash: string): Promise<boolean> {
  return verify(encodedHash, plain);
}