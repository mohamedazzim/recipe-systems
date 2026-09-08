import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 'flat' = border only · 'raised' = whisper elevation · default = soft card shadow. */
  elevation?: 'flat' | 'raised' | 'card';
  /** Remove padding for media-bleed content. */
  padded?: boolean;
}

export function Card({
  elevation = 'card',
  padded = true,
  className = '',
  children,
  ...props
}: CardProps) {
  const elevationClasses: Record<NonNullable<CardProps['elevation']>, string> = {
    flat: 'border border-border',
    raised: 'border border-border bg-surface shadow-whisper',
    card: 'border border-border bg-surface shadow-card',
  };
  return (
    <div
      {...props}
      className={`rounded-lg ${elevationClasses[elevation]} ${padded ? 'p-5 sm:p-6' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export interface CardSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A titled section inside a larger surface — the analysis-card building block. */
export function CardSection({ title, description, action, children, className = '' }: CardSectionProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            {title && <h3 className="text-h3 font-sans text-ink">{title}</h3>}
            {description && <p className="text-small text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
