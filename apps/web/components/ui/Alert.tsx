import type { ReactNode } from 'react';

export type AlertTone = 'error' | 'warning' | 'info' | 'success';

const toneClasses: Record<AlertTone, { box: string; title: string }> = {
  error: { box: 'border-negative/40 bg-negative/8', title: 'text-negative' },
  warning: { box: 'border-gold/60 bg-gold/10', title: 'text-gold dark:text-gold' },
  info: { box: 'border-border-strong bg-ink/4', title: 'text-ink' },
  success: { box: 'border-positive/40 bg-positive/8', title: 'text-positive' },
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
