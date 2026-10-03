import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';

/**
 * Pill that switches to the *other* language. Label shows the target language
 * in its own script (standard i18n pattern), so ARR buttons stay readable in
 * both directions.
 */
export function LanguageSwitch() {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.split('-')[0] ?? 'en';
  const next: 'en' | 'ar' = current === 'ar' ? 'en' : 'ar';

  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      className="inline-flex items-center gap-0.5 rounded-full border border-ink/15 bg-white px-3 py-1 text-sm font-medium text-ink transition-colors hover:border-crimson hover:text-crimson"
    >
      <GlobeIcon />
      {t(next === 'ar' ? 'arabic' : 'english')}
      <span className="sr-only">{t('language')}</span>
    </button>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      className="size-4"
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15M10 2.5c2.2 2 3.3 4.5 3.3 7.5s-1.1 5.5-3.3 7.5c-2.2-2-3.3-4.5-3.3-7.5s1.1-5.5 3.3-7.5Z" />
    </svg>
  );
}