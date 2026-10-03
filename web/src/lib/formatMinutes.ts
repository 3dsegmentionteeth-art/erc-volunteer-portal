import type { TFunction } from 'i18next';

/**
 * Formats a signed duration as compact "Xh Ym" / "-Xh Ym". Negative values are
 * official admin subtractions and are shown with a leading minus. Locale-
 * dependent unit labels come from i18n (`unitHours` / `unitMinutes`).
 */
export function formatMinutes(minutes: number, t: TFunction): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = minutes < 0 ? '− ' : '';
  if (h === 0) return `${sign}${m}${t('unitMinutes')}`;
  if (m === 0) return `${sign}${h}${t('unitHours')}`;
  return `${sign}${h}${t('unitHours')} ${m}${t('unitMinutes')}`;
}

/** YYYY-MM-DD view of a UTC-midnight ISO date string, for `<input type=date>`. */
export function dateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/** Today as YYYY-MM-DD (UTC), the default for add/edit request forms. */
export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}