import 'dotenv/config';

function intFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

if (isProd) {
  const csrf = process.env.CSRF_SECRET ?? '';
  const session = process.env.SESSION_SECRET ?? '';
  if (session.length < 32) {
    console.error('FATAL: SESSION_SECRET must be a strong random value of >= 32 chars in production.');
    process.exit(1);
  }
  if (csrf.length < 32) {
    console.error('FATAL: CSRF_SECRET must be a strong random value of >= 32 chars in production.');
    process.exit(1);
  }
}

export const config = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: intFromEnv('PORT', 4000),
  publicHost: process.env.PUBLIC_HOST ?? 'http://localhost:4000',
  // Number of trusted reverse-proxy hops. 0 = no proxy (rate limiting and
  // audit ip_address then use req.ip = socket address). Set to the real
  // proxy count in production or login throttling will collapse on 1 key.
  trustProxyHops: intFromEnv('TRUST_PROXY_HOPS', 0),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://erc:erc_dev_password@localhost:5432/erc_portal?schema=public',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-session-secret-change-me',
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'erc.sid',
  sessionMaxAgeMs: intFromEnv('SESSION_MAX_AGE_MS', 7 * 24 * 60 * 60 * 1000),
  csrfSecret: process.env.CSRF_SECRET ?? 'dev-only-csrf-secret-change-me',
  auth: {
    loginRateLimit: intFromEnv('AUTH_LOGIN_RATE_LIMIT', 20),
    loginRateWindowMs: intFromEnv('AUTH_LOGIN_RATE_WINDOW_MS', 15 * 60 * 1000),
    loginSlowDownAfter: intFromEnv('AUTH_LOGIN_SLOW_DOWN_AFTER', 5),
    loginSlowDownMs: intFromEnv('AUTH_LOGIN_SLOW_DOWN_MS', 300),
    registerRateLimit: intFromEnv('AUTH_REGISTER_RATE_LIMIT', 5),
    registerRateWindowMs: intFromEnv('AUTH_REGISTER_RATE_WINDOW_MS', 15 * 60 * 1000),
    // Email-verification token attempts (256-bit random, but a missing reply
    // to the dev "email" is otherwise silently unobservable).
    verifyRateLimit: intFromEnv('AUTH_VERIFY_RATE_LIMIT', 20),
    verifyRateWindowMs: intFromEnv('AUTH_VERIFY_RATE_WINDOW_MS', 15 * 60 * 1000),
    emailVerificationTtlMs: intFromEnv('EMAIL_VERIFICATION_TTL_MS', 24 * 60 * 60 * 1000),
    // Lifetime of the application-access token that lets an applicant attach
    // documents to their *pending* registration. Matching (default) or shorter
    // than the email-verification TTL; burned at the registration decision.
    applicationAccessTokenTtlMs: intFromEnv('APPLICATION_ACCESS_TOKEN_TTL_MS', 24 * 60 * 60 * 1000),
  },
  reporting: {
    // Public verification-reference lookups (per IP): the opaque ref is the
    // credential, so this ceiling exists to blunt brute-force enumeration
    // without ever turning a miss into a distinguishable response.
    verifyRefRateLimit: intFromEnv('VERIFY_REF_RATE_LIMIT', 30),
    verifyRefRateWindowMs: intFromEnv('VERIFY_REF_RATE_WINDOW_MS', 15 * 60 * 1000),
    // Service-report generation (per IP), an admin mutation that writes audit
    // + a fresh verification reference. Generous but bounded.
    reportRateLimit: intFromEnv('REPORT_RATE_LIMIT', 120),
    reportRateWindowMs: intFromEnv('REPORT_RATE_WINDOW_MS', 15 * 60 * 1000),
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: intFromEnv('MINIO_PORT', 9000),
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'erc_dev',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'erc_dev_secret',
    bucket: process.env.MINIO_BUCKET ?? 'erc-documents',
    useSsl: (process.env.MINIO_USE_SSL ?? 'false').toLowerCase() === 'true',
  },
  time: {
    // Volunteer-submitted time requests (add / edit), per IP. Same
    // nuisance-abuse posture as the other volunteer-facing limiters.
    requestRateLimit: intFromEnv('TIME_REQUEST_RATE_LIMIT', 20),
    requestRateWindowMs: intFromEnv('TIME_REQUEST_RATE_WINDOW_MS', 15 * 60 * 1000),
    // A single service day; larger or multi-day claims go through admin
    // adjustment (Phase 5) rather than a volunteer request.
    maxMinutesPerRequest: intFromEnv('TIME_MAX_MINUTES_PER_REQUEST', 1440),
    // Volunteers may ask to correct an approved record only within this many
    // days of its service date (prototype rule, now enforced server-side).
    editRequestWindowDays: intFromEnv('TIME_EDIT_REQUEST_WINDOW_DAYS', 14),
    // Administrative review/decision/adjustment mutations (per IP). Lower
    // ceiling than the volunteer submitter limiter by design.
    adminActionRateLimit: intFromEnv('TIME_ADMIN_ACTION_RATE_LIMIT', 60),
    adminActionRateWindowMs: intFromEnv('TIME_ADMIN_ACTION_RATE_WINDOW_MS', 15 * 60 * 1000),
  },
  documents: {
    // Public upload throttle (per IP). Nuisance-abuse guard, not a security
    // boundary: authenticity of pending-registration uploads rests on the
    // unguessable registration id (see SECURITY.md).
    uploadRateLimit: intFromEnv('DOCUMENT_UPLOAD_RATE_LIMIT', 20),
    uploadRateWindowMs: intFromEnv('DOCUMENT_UPLOAD_RATE_WINDOW_MS', 15 * 60 * 1000),
    maxBytes: intFromEnv('DOCUMENT_MAX_BYTES', 5 * 1024 * 1024),
    // Lifetime of the admins' pre-signed download URLs (private bucket).
    presignedTtlSeconds: intFromEnv('DOCUMENT_PRESIGNED_TTL_SECONDS', 300),
    // server-side allowlist; anything else is rejected before storage
    allowedMimeTypes: (
      process.env.DOCUMENT_ALLOWED_MIME_TYPES ??
      'image/png,image/jpeg,image/webp,application/pdf'
    )
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },
  smtp: {
    // Empty host => no real delivery; the dev fallback logs the verification
    // link instead. NEVER rely on that fallback outside a local dev machine.
    host: process.env.SMTP_HOST ?? '',
    port: intFromEnv('SMTP_PORT', 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? 'ERC Volunteer Service Portal <noreply@erc.local>',
    secure: (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true',
  },
} as const;

export type AppConfig = typeof config;