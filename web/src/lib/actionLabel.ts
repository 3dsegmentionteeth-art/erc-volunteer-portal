import type { TFunction } from 'i18next';

/**
 * Maps the server's dotted audit action (e.g. `time.add_request.approved`) to
 * a flat i18n key (`act_time_add_request_approved`). Unknown/new actions fall
 * back to the raw server action string rather than a bucket key, so the UI
 * never lies about what happened.
 */
export function actionLabelKey(action: string): string {
  return `act_${action.replace(/\./g, '_')}`;
}

export function actionLabel(action: string, t: TFunction): string {
  const key = actionLabelKey(action);
  const label = t(key);
  return label === key ? action : label;
}

const TARGET_KEYS: Record<string, string> = {
  volunteer: 'targetVolunteer',
  timeAddRequest: 'targetTimeAddRequest',
  timeEditRequest: 'targetTimeEditRequest',
  serviceTimeRecord: 'targetServiceTimeRecord',
  registration: 'targetRegistration',
  document: 'targetDocument',
};

/**
 * The server's targetType strings are camelCase; map them onto the flat i18n
 * keys so admin tables and filter dropdowns share one vocabulary. Unknown
 * target types fall back to the raw server value.
 */
export function targetLabel(targetType: string | null | undefined, t: TFunction): string {
  if (!targetType) return '—';
  const key = TARGET_KEYS[targetType];
  return key ? t(key) : targetType;
}