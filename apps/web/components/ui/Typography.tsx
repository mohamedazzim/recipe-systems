import type { ReactNode } from 'react';

// Typography hierarchy — Fraunces for display/headings, IBM Plex Sans for everything
// that must scan (UI, body, labels). Type is the primary hierarchy tool; boxes and
// color come after it.

export function Display({ className = '', children }: { className?: string; children: ReactNode }) {
  return <h1 className={`font-display text-display text-ink ${className}`}>{children}</h1>;
}

export function Heading({
  level = 2,
  className = '',
  id,
  children,
}: {
  level?: 1 | 2 | 3 | 4;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
  const sizes: Record<number, string> = {
    1: 'font-display text-h1',
    2: 'font-display text-h2',
    3: 'font-sans text-h3',
    4: 'font-sans text-body font-semibold',
  };
  return (
    <Tag id={id} className={`${sizes[level]} text-ink ${className}`}>
      {children}
    </Tag>
  );
}

export function Text({ className = '', children }: { className?: string; children: ReactNode }) {
  return <p className={`text-body text-body ${className}`}>{children}</p>;
}

export function MutedText({ className = '', children }: { className?: string; children: ReactNode }) {
  return <p className={`text-small text-muted ${className}`}>{children}</p>;
}

/** Small-caps section marker ("Taste pillars", "How it works", …). */
export function Eyebrow({
  id,
  className = '',
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return <p id={id} className={`eyebrow ${className}`}>{children}</p>;
}
