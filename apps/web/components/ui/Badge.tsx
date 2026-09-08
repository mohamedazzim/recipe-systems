import type { ReactNode } from 'react';

export type Tag = 'CARD' | 'METHOD' | 'INFERRED' | 'ABSENT' | 'UNKNOWN' | 'ASSUMED';

const tagStyles: Record<Tag, string> = {
  CARD: 'border-turmeric bg-turmeric/15 text-[#8A6516]',
  METHOD: 'border-curry-leaf bg-curry-leaf/15 text-curry-leaf',
  INFERRED: 'border-tamarind/70 bg-tamarind/15 text-tamarind/80',
  ABSENT: 'border-ash-gourd bg-transparent text-muted',
  UNKNOWN: 'border-chili bg-transparent text-chili',
  ASSUMED: 'border-dashed border-ash-gourd bg-transparent text-muted',
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
