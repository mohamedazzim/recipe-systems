import type { ReactNode } from 'react';

export type Tag = 'CARD' | 'METHOD' | 'INFERRED' | 'ABSENT' | 'UNKNOWN' | 'ASSUMED';

const tagStyles: Record<Tag, string> = {
  CARD: 'border-border bg-background text-muted',
  METHOD: 'border-accent/40 bg-accent/10 text-accent-strong',
  INFERRED: 'border-gold/60 bg-gold/10 text-gold',
  ABSENT: 'border-negative/40 bg-negative/8 text-negative',
  UNKNOWN: 'border-border bg-background text-muted',
  ASSUMED: 'border-dashed border-border bg-background text-muted',
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
