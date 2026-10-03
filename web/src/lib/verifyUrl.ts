/** Absolute verification URL for a reference, as printed in the QR code and the copy-link action. */
export function verifyUrl(ref: string): string {
  return `${window.location.origin}/verify/${ref}`;
}