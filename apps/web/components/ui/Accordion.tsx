'use client';

// Accessible accordion — one open section at a time (or multiple when
// configured). Headers are real buttons with aria-expanded/aria-controls and
// unique panel ids; Enter/Space are native button keyboard behavior. The
// label is exposed as the button's accessible name (aria-labelledby) so
// queries stay exact while the optional description remains supplementary.

import { useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';

export interface AccordionItem {
  id: string;
  label: string;
  description?: string;
  content: React.ReactNode;
}

export function Accordion({
  items,
  defaultOpen,
  allowMultiple = false,
  label = 'Accordion',
}: {
  items: AccordionItem[];
  /** Id of the item open on first render. */
  defaultOpen?: string;
  /** Keep several sections open at once (defaults to one-at-a-time). */
  allowMultiple?: boolean;
  /** Accessible name for the accordion container. */
  label?: string;
}) {
  const [openIds, setOpenIds] = useState<string[]>(defaultOpen ? [defaultOpen] : []);

  const toggle = (id: string): void => {
    setOpenIds((prev) => {
      if (allowMultiple) {
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      }
      return prev.includes(id) ? [] : [id];
    });
  };

  return (
    <div className="space-y-2" aria-label={label}>
      {items.map((item) => {
        const open = openIds.includes(item.id);
        const headerId = `${item.id}-header`;
        const labelId = `${item.id}-label`;
        const panelId = `${item.id}-panel`;
        return (
          <div key={item.id} className="overflow-hidden rounded-lg border border-border bg-surface">
            <h3 className="m-0">
              <button
                type="button"
                id={headerId}
                aria-expanded={open}
                aria-controls={panelId}
                aria-labelledby={labelId}
                onClick={() => toggle(item.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                <span className="min-w-0 flex-1">
                  <span id={labelId} className="block text-body font-semibold text-ink">
                    {item.label}
                  </span>
                  {item.description && (
                    <span className="mt-0.5 block text-caption text-muted">{item.description}</span>
                  )}
                </span>
                <CaretDown
                  size={16}
                  aria-hidden="true"
                  weight="bold"
                  className={`shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                />
              </button>
            </h3>
            {open && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                className="border-t border-border px-4 py-4"
              >
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
