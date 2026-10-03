import { useId } from 'react';
import { cn } from '../lib/cn';

interface SelectFieldProps<T extends string | number> {
  label: string;
  name: string;
  value: T | '';
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
}

export function SelectField<T extends string | number>({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  required = false,
  error,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-crimson" aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-invalid={error ? true : undefined}
        className={cn(
          'w-full rounded-lg border bg-white px-3.5 py-2 text-ink shadow-sm transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-crimson/40',
          error ? 'border-crimson' : 'border-ink/15',
          value === '' ? 'text-muted' : '',
        )}
      >
        {placeholder ? <option value="" disabled>{placeholder}</option> : null}
        {options.map((o) => (
          <option key={String(o.value)} value={o.value} className="text-ink">
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-sm text-crimson-dark">{error}</p>
      ) : null}
    </div>
  );
}