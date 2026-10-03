import multer from 'multer';
import { config } from '../config';
import { ApiError } from './http';

// Multipart upload pipeline for registration documents. Files are buffered in
// memory (bounded by `maxBytes`, default 5 MB), type-checked server-side and
// held until the route persists them to object storage.

const ALLOWED = new Set(config.documents.allowedMimeTypes);

export const registrationDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.documents.maxBytes,
    files: 1,
    fields: 4,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype.toLowerCase())) {
      cb(new ApiError(400, 'This file type is not supported.', 'UNSUPPORTED_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

export function sanitizeOriginalName(name: string): string {
  // Keep the base file name only and collapse control/quote characters that
  // could leak into headers or filenames on download.
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point of this sanitizer
    .replace(/[\u0000-\u001f\u007f"<>]/g, '')
    .slice(0, 255)
    .trim();
}