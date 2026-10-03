import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Inline banner for form/server errors. `tone` maps to the app error palette. */
export function ErrorBanner({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'notice' }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-crimson/30 bg-crimson/5 text-crimson-dark'
          : 'border-ink/10 bg-white text-ink',
      )}
    >
      {children}
    </div>
  );
}