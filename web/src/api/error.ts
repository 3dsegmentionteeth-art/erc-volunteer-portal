/**
 * Normalized API error. The server's error envelope is
 * `{ error: { message, code, ... } }`; we surface `code` (stable) and the
 * human `message` (useful with languages the app has no key for yet).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}