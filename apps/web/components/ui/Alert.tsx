import type { ReactNode } from 'react';

export type AlertTone = 'error' | 'warning' | 'info' | 'success';

const toneClasses: Record<AlertTone, { box: string; title: string }> = {
  // Opacity must come from Tailwind's scale (5/10/…): `/8` and `/4` are not in the
  // default theme, so they emitted no rule and every Alert rendered as a bare border.
  error: { box: 'border-negative/40 bg-negative/10', title: 'text-negative' },
  warning: { box: 'border-gold/60 bg-gold/10', title: 'text-gold dark:text-gold' },
  info: { box: 'border-border-strong bg-ink/5', title: 'text-ink' },
  success: { box: 'border-positive/40 bg-positive/10', title: 'text-positive' },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** ARIA live region role — errors default to `alert` (assertive); success
   *  states should pass `status` (polite). */
  role?: 'alert' | 'status';
}

/** Inline feedback with an accessible live-region role — errors announce to screen readers. */
export function Alert({ tone = 'info', title, children, className = '', role = 'alert' }: AlertProps) {
  return (
    <div
      role={role}
      className={`rounded-md border px-4 py-3 ${toneClasses[tone].box} ${className}`}
    >
      {title && <p className={`text-small font-semibold ${toneClasses[tone].title}`}>{title}</p>}
      {children && <div className="mt-0.5 text-small text-body">{children}</div>}
    </div>
  );
}
