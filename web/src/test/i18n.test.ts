import { beforeEach, describe, expect, it } from 'vitest';
import i18n, { setLanguage } from '../i18n';

beforeEach(async () => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await i18n.changeLanguage('en');
});

function ready(): Promise<void> {
  return i18n.isInitialized ? Promise.resolve() : new Promise((r) => i18n.on('initialized', () => r()));
}

describe('i18n', () => {
  it('defaults to English with LTR direction', async () => {
    await ready();
    expect(i18n.language?.split('-')[0]).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('switches to Arabic (first-class) and flips the document to RTL', async () => {
    await ready();
    setLanguage('ar');
    await new Promise((r) => setTimeout(r, 0));
    expect(i18n.language?.split('-')[0]).toBe('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(i18n.t('loginTitle')).toBe('تسجيل الدخول');
    expect(i18n.t('brand')).toBe('الهلال الأحمر المصري');
  });

  it('persists the language choice for the next visit', async () => {
    await ready();
    setLanguage('ar');
    expect(localStorage.getItem('erc-lang')).toBe('ar');
    setLanguage('en');
    expect(localStorage.getItem('erc-lang')).toBe('en');
  });
});