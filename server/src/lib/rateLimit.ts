import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { config } from '../config';

const standard429 = (code: string) => ({
  error: { code, message: 'Too many requests. Please try again later.' },
});

export const loginLimiter = rateLimit({
  windowMs: config.auth.loginRateWindowMs,
  limit: config.auth.loginRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(standard429('LOGIN_RATE_LIMITED'));
  },
});

export const loginSlowDown = slowDown({
  windowMs: config.auth.loginRateWindowMs,
  delayAfter: config.auth.loginSlowDownAfter,
  // Constant per-request penalty once the threshold is crossed (new v2 API).
  delayMs: () => config.auth.loginSlowDownMs,
});

export const registerLimiter = rateLimit({
  windowMs: config.auth.registerRateWindowMs,
  limit: config.auth.registerRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(standard429('REGISTER_RATE_LIMITED'));
  },
});

export const verifyLimiter = rateLimit({
  windowMs: config.auth.verifyRateWindowMs,
  limit: config.auth.verifyRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(standard429('VERIFY_RATE_LIMITED'));
  },
});

export const documentUploadLimiter = rateLimit({
  windowMs: config.documents.uploadRateWindowMs,
  limit: config.documents.uploadRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(standard429('DOCUMENT_UPLOAD_RATE_LIMITED'));
  },
});

export const timeRequestLimiter = rateLimit({
  windowMs: config.time.requestRateWindowMs,
  limit: config.time.requestRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(standard429('TIME_REQUEST_RATE_LIMITED'));
  },
});

// Administrative review/decision/adjustment actions: lower ceiling than the
// volunteer submitter limiter, because a misbehaving admin can mutate many
// rows. Reads under /admin/time are unthrottled (GET).
export const adminTimeLimiter = rateLimit({
  windowMs: config.time.adminActionRateWindowMs,
  limit: config.time.adminActionRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(standard429('TIME_ADMIN_ACTION_RATE_LIMITED'));
  },
});

// Phase 6: public verification-reference lookups (opaque ref is the credential).
export const verifyRefLimiter = rateLimit({
  windowMs: config.reporting.verifyRefRateWindowMs,
  limit: config.reporting.verifyRefRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(standard429('VERIFY_REF_RATE_LIMITED'));
  },
});

// Phase 6: service-report generation. It writes an audit row + verification
// reference, so it is throttled like the admin decision mutations even though
// the HTTP verb is GET.
export const reportLimiter = rateLimit({
  windowMs: config.reporting.reportRateWindowMs,
  limit: config.reporting.reportRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(standard429('REPORT_RATE_LIMITED'));
  },
});