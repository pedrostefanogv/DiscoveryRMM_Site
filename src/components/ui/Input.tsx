import { useId } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = '', id, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-') ?? generatedId;
  const helpId = `${inputId}-help`;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? helpId : undefined}
        className={`w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 ${
          error ? 'border-danger/50' : ''
        } ${className}`}
        {...props}
      />
      {error && <p id={helpId} className="text-xs text-danger">{error}</p>}
      {hint && !error && <p id={helpId} className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  hint?: string;
}

export function Select({ label, options, className = '', id, hint, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-') ?? generatedId;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full rounded-xl border border-input-border bg-input px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 ${className}`}
        {...props}
      >
        {options.map(opt => (
          <option
            key={opt.value}
            value={opt.value}
            className="bg-white text-slate-900 dark:bg-surface dark:text-foreground"
          >
            {opt.label}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function TextArea({ label, error, hint, className = '', id, ...props }: TextAreaProps) {
  const generatedId = useId();
  const textId = id ?? label?.toLowerCase().replace(/\s+/g, '-') ?? generatedId;
  const helpId = `${textId}-help`;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={textId} className="block text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <textarea
        id={textId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? helpId : undefined}
        className={`w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 ${
          error ? 'border-danger/50' : ''
        } ${className}`}
        rows={3}
        {...props}
      />
      {error && <p id={helpId} className="text-xs text-danger">{error}</p>}
      {hint && !error && <p id={helpId} className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
