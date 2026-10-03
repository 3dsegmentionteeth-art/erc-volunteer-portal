import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { ar } from './ar';
import { en } from './en';

// Arabic is first-class: the document flips to RTL the moment it becomes the
// active language. All layout utilities use logical properties so the flip is
// cosmetic, not structural.
const RTL_LOCALES = ['ar'];
const DEFAULT_LANGUAGE = 'en';

function applyHtmlLanguage(lng: string): void {
  const root = document.documentElement;
  root.lang = lng.split('-')[0];
  root.dir = RTL_LOCALES.includes(root.lang) ? 'rtl' : 'ltr';
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: ['en', 'ar'],
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    detection: {
      // Persist the choice for the session *and* subsequent visits; fall back
      // to the browser's own language. No cookies (the server doesn't need it).
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'erc-lang',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  .then(() => applyHtmlLanguage(i18n.language ?? DEFAULT_LANGUAGE))
  .catch(() => applyHtmlLanguage(DEFAULT_LANGUAGE));

// NOTE: i18next v26 can resolve init() synchronously (inline resources + sync
// detection) and does NOT re-emit 'initialized'/'languageChanged' with the boot
// language, so the document attributes are applied from the resolved promise
// above. Without it an Arabic-first visit renders Arabic text while the <html>
// stays lang="en" dir="ltr"; the switch still works via 'languageChanged'.
i18n.on('languageChanged', (lng) => applyHtmlLanguage(lng));

/** Explicit language switch (also used by the header toggle). */
export function setLanguage(lng: 'en' | 'ar'): void {
  void i18n.changeLanguage(lng);
  try {
    localStorage.setItem('erc-lang', lng);
  } catch {
    // localStorage unavailable (private mode) — in-memory switch still works.
  }
}

export default i18n;