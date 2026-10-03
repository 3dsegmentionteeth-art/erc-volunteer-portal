import { Request, Response } from 'express';
import { ApiError, asyncHandler } from '../../lib/http';
import { getActor, SessionActor } from '../../middleware/auth';
import type { DeleteBody, UploadBody } from './document.schemas';
import {
  approveDocument,
  deleteRegistrationDocument,
  documentDownloadUrl,
  listRegistrationDocuments,
  rejectDocument,
  uploadRegistrationDocument,
} from './document.service';

function actorOf(req: Request): SessionActor {
  const actor = getActor(req);
  if (!actor) throw new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED');
  return actor;
}

function uploadedFileOf(req: Request) {
  const file = req.file;
  if (!file) throw new ApiError(400, 'A file is required.', 'FILE_REQUIRED');
  return file;
}

// Public applicant path.
export const upload = asyncHandler(async (req: Request, res: Response) => {
  const file = uploadedFileOf(req);
  const { category, applicationAccessToken } = req.body as UploadBody;
  const document = await uploadRegistrationDocument(req.params.registrationId as string, {
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalname: file.originalname,
    size: file.size,
  }, category, applicationAccessToken, req.ip);
  res.status(201).json({ document });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { applicationAccessToken } = req.body as DeleteBody;
  await deleteRegistrationDocument(
    req.params.registrationId as string,
    req.params.documentId as string,
    applicationAccessToken,
    req.ip,
  );
  res.json({ ok: true });
});

// Admin review path (router gates on requireAuth('admin')).
export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const { category } = req.query as { category?: string };
  const result = await listRegistrationDocuments(user, req.params.registrationId as string, category);
  res.json(result);
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const document = await approveDocument(user, req.params.documentId as string, req.ip);
  res.json({ document });
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const { note } = req.body as { note?: string };
  const document = await rejectDocument(user, req.params.documentId as string, note, req.ip);
  res.json({ document });
});

export const downloadUrl = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const result = await documentDownloadUrl(user, req.params.documentId as string);
  res.json(result);
});