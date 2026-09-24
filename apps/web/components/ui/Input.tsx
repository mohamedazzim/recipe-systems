import { useCallback, useEffect, useRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const fieldClasses =
  'w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink ' +
  'placeholder:text-faint transition-colors ' +
  // A full-opacity ring, not gold/40: the ring is this control's ONLY focus
  // indicator (the outline is suppressed), so it has to clear non-text contrast.
  'hover:border-ink/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-gold ' +
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
  /** Grow the height to fit the content as the user types (no manual resize). */
  autoGrow?: boolean;
}

export function Textarea({ invalid = false, autoGrow = false, className = '', onChange, rows, ...props }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (autoGrow) resize();
  }, [autoGrow, resize, props.value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={rows}
      onChange={(e) => {
        if (autoGrow) resize();
        onChange?.(e);
      }}
      aria-invalid={invalid || undefined}
      className={`${fieldClasses} ${autoGrow ? 'min-h-24 resize-none overflow-hidden leading-relaxed' : 'min-h-40 resize-y leading-relaxed'} ${invalid ? 'border-negative ring-2 ring-negative/20' : ''} ${className}`}
    />
  );
}
