import { cn } from '../lib/cn';

/** ERC crescent mark on a red field, rendered inline (no external assets). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="ERC" className={cn('size-8 shrink-0', className)}>
      <circle cx="16" cy="16" r="14" fill="#C70E1A" />
      <path d="M19.5 7.5A10 10 0 1 0 24 20 8 8 0 0 1 19.5 7.5Z" fill="#fff" />
    </svg>
  );
}