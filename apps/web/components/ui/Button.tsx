import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders as a full-width button — opt in per context, never the default. */
  block?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  // One saturated action color in the system; reserved for the single primary action per view.
  primary:
    'bg-accent text-surface hover:bg-accent-strong active:bg-accent-strong disabled:bg-faint disabled:text-surface',
  secondary:
    'bg-ink/5 text-ink hover:bg-ink/10 active:bg-ink/10 disabled:text-faint',
  outline:
    'border border-border-strong bg-transparent text-ink hover:border-ink/40 hover:bg-ink/5 active:bg-ink/10 disabled:text-faint disabled:border-border',
  ghost: 'bg-transparent text-accent hover:bg-accent/10 active:bg-accent/10 disabled:text-faint',
  danger:
    'bg-negative text-surface hover:bg-negative/90 active:bg-negative/90 disabled:bg-faint disabled:text-surface',
};

const sizes: Record<ButtonSize, string> = {
  // `sm` is a dense desktop size, but a phone or tablet is touched, not clicked —
  // below lg it grows to the 44px touch minimum and the extra density is left to
  // the pointer-driven laptop/desktop widths.
  sm: 'min-h-9 max-lg:min-h-11 px-3 py-1.5 text-small',
  md: 'min-h-11 px-4 py-2 text-sm',
  lg: 'min-h-12 px-5 py-2.5 text-body',
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold
        disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
    />
  );
}
