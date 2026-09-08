import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** A short glyph/icon that reads as content, not decoration. Optional. */
  glyph?: ReactNode;
  className?: string;
}

/**
 * Intentional empty state — no blank whitespace, no placeholder junk.
 * Every list surface in the product renders one of these until real data exists.
 */
export function EmptyState({ title, description, action, glyph, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center ${className}`}
    >
      {glyph && (
        <div aria-hidden="true" className="mb-1 text-2xl text-faint">
          {glyph}
        </div>
      )}
      <h3 className="text-h3 font-sans text-ink">{title}</h3>
      {description && <p className="max-w-prose text-small text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
