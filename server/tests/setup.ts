// Runs before every test file, in the same worker, so src modules imported by
// the tests see these values. `dotenv` (loaded inside config) does not
// overwrite env vars that are already set, so the test DB wins.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://erc:erc_dev_password@localhost:5432/erc_portal_test?schema=public';

// Generous defaults so rate limiting only interferes where a test opts into it.
process.env.AUTH_LOGIN_RATE_LIMIT = process.env.AUTH_LOGIN_RATE_LIMIT ?? '1000';
process.env.AUTH_LOGIN_RATE_WINDOW_MS = process.env.AUTH_LOGIN_RATE_WINDOW_MS ?? '60000';
process.env.AUTH_LOGIN_SLOW_DOWN_AFTER = process.env.AUTH_LOGIN_SLOW_DOWN_AFTER ?? '1000';
process.env.AUTH_LOGIN_SLOW_DOWN_MS = '300';
// `??` preserves values pre-set by a rate-limit test file so its low limits
// survive until the config singleton first loads (see the rate-limit specs).
process.env.AUTH_REGISTER_RATE_LIMIT = process.env.AUTH_REGISTER_RATE_LIMIT ?? '1000';
process.env.AUTH_REGISTER_RATE_WINDOW_MS = process.env.AUTH_REGISTER_RATE_WINDOW_MS ?? '60000';
process.env.AUTH_VERIFY_RATE_LIMIT = process.env.AUTH_VERIFY_RATE_LIMIT ?? '1000';
process.env.AUTH_VERIFY_RATE_WINDOW_MS = process.env.AUTH_VERIFY_RATE_WINDOW_MS ?? '60000';

// Documents: the applicant upload suite performs many uploads per file; keep
// the limiter out of the way unless a test opts into it.
process.env.DOCUMENT_UPLOAD_RATE_LIMIT = process.env.DOCUMENT_UPLOAD_RATE_LIMIT ?? '1000';
process.env.DOCUMENT_UPLOAD_RATE_WINDOW_MS = process.env.DOCUMENT_UPLOAD_RATE_WINDOW_MS ?? '60000';

// Documents: use a dedicated bucket so dev artifacts never mix with test data
// (bucket is auto-created by lib/storage on first upload).
process.env.MINIO_BUCKET = process.env.MINIO_BUCKET ?? 'erc-documents-test';

// Time requests: the suite submits many add/edit requests per file; keep the
// limiter out of the way unless a test opts into it.
process.env.TIME_REQUEST_RATE_LIMIT = process.env.TIME_REQUEST_RATE_LIMIT ?? '1000';
process.env.TIME_REQUEST_RATE_WINDOW_MS = process.env.TIME_REQUEST_RATE_WINDOW_MS ?? '60000';