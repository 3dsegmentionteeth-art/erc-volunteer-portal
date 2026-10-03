import { describe, expect, it } from 'vitest';

const settle = () => new Promise((r) => setTimeout(r, 150));

describe('i18n Arabic-first boot', () => {
  it('boots an Arabic-first visit with the document flipped to RTL', async () => {
    localStorage.setItem('erc-lang', 'ar');
    await import('../i18n');
    await settle();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });
});