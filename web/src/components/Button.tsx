import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-crimson text-white hover:bg-crimson-dark active:bg-crimson-deep disabled:bg-crimson/40 shadow-sm',
  secondary:
    'bg-white text-ink border border-ink/15 hover:border-crimson hover:text-crimson disabled:opacity-50',
  ghost: 'text-ink hover:text-crimson disabled:opacity-50',
  danger: 'bg-crimson-dark text-white hover:bg-crimson-deep disabled:opacity-50',
};

const sizeClasses: Record<Size, string> = {
  sm: 'text-sm rounded-lg px-3 py-1.5 gap-1.5',
  md: 'text-sm rounded-lg px-4 py-2 gap-2',
  lg: 'text-base rounded-xl px-5 py-2.5 gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', busy = false, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type={rest.type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors select-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}