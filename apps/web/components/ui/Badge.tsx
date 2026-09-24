import type { ReactNode } from 'react';

export type Tag = 'CARD' | 'METHOD' | 'INFERRED' | 'ABSENT' | 'UNKNOWN' | 'ASSUMED';

const tagStyles: Record<Tag, string> = {
  // `bg-background` is not a token in this system (it is `surface`), so these tags
  // silently rendered unfilled. Opacity also has to come from the theme scale.
  CARD: 'border-border bg-surface text-muted',
  METHOD: 'border-accent/40 bg-accent/10 text-accent-strong',
  INFERRED: 'border-gold/60 bg-gold/10 text-gold',
  ABSENT: 'border-negative/40 bg-negative/10 text-negative',
  UNKNOWN: 'border-border bg-surface text-muted',
  ASSUMED: 'border-dashed border-border bg-surface text-muted',
};

export function Badge({ tag, children }: { tag: Tag; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tagStyles[tag]}`}
    >
      {children ?? tag}
    </span>
  );
}
