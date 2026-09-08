import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const fieldClasses =
  'w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink ' +
  'placeholder:text-faint transition-colors ' +
  'hover:border-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-gold/40 ' +
  'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-faint';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marks the field invalid (aria-invalid + error border) without relying on color alone. */
  invalid?: boolean;
}

export function Input({ invalid = false, className = '', ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={`${fieldClasses} ${invalid ? 'border-negative ring-2 ring-negative/20' : ''} ${className}`}
    />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid = false, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={`${fieldClasses} min-h-40 resize-y leading-relaxed ${invalid ? 'border-negative ring-2 ring-negative/20' : ''} ${className}`}
    />
  );
}
