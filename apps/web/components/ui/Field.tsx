import type { ReactNode } from 'react';

export interface FieldProps {
  /** For a11y: becomes the label's `for` and ties to the control's id. */
  htmlFor: string;
  label: string;
  /** Extra explanation shown under the label. */
  hint?: ReactNode;
  /** Error message — rendered as an accessible description/error pair. */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + hint + error + control — the one form pattern for the whole product. */
export function Field({ htmlFor, label, hint, error, children, className = '' }: FieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {hint && <p className="text-small text-muted">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="text-small font-medium text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
