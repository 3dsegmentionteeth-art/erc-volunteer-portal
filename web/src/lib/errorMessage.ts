import type { TFunction } from 'i18next';
import { ApiError } from '../api/error';

/** Map a server/network ApiError to a localized message where we have a key. */
export function apiErrorMessage(err: unknown, t: TFunction): string {
  if (!(err instanceof ApiError)) return t('errorUnexpected');
  switch (err.code) {
    case 'NETWORK_ERROR':
      return t('errorNetwork');
    case 'CSRF_TOKEN_INVALID':
      return t('errorCsrf');
    case 'EMAIL_ALREADY_REGISTERED':
      return t('errorEmailAlreadyRegistered');
    case 'VALIDATION_ERROR':
      return t('errorValidation');
    default:
      // No dedicated key: surface the server's own (English) message rather
      // than a generic one; it is still honest.
      return err.message || t('errorUnexpected');
  }
}