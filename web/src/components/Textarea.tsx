import { useId } from 'react';
import { cn } from '../lib/cn';

interface TextareaProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  rows?: number;
}

/** Multi-line field for line-delimited data (skills, certifications). */
export function Textarea({
  label,
  name,
  value,
  onChange,
  placeholder,
  required = false,
  error,
  rows = 4,
}: TextareaProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-crimson" aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        id={id}
        name={name}
        value={value}
        rows={rows}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={cn(
          'w-full rounded-lg border bg-white px-3.5 py-2 text-ink shadow-sm transition-colors',
          'placeholder:text-muted/70',
          'focus:outline-none focus:ring-2 focus:ring-crimson/40',
          error ? 'border-crimson' : 'border-ink/15',
        )}
      />
      {error ? (
        <p role="alert" className="text-sm text-crimson-dark">{error}</p>
      ) : null}
    </div>
  );
}