'use client';

import type { ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  /** Optional count/badge text, e.g. an evidence count. */
  count?: string;
}

export interface TabsProps {
  tabs: Tab[];
  active: string;
  onSelect: (id: string) => void;
  /** Accessible label for the tablist (e.g. "Analysis views"). */
  label: string;
  className?: string;
}

/**
 * Keyboard-accessible tab strip (roving tabindex, arrow keys) — the navigation
 * pattern for the nine analysis views and other fixed-view surfaces.
 */
export function Tabs({ tabs, active, onSelect, label, className = '' }: TabsProps) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 overflow-x-auto ${className}`}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((t) => t.id === tab.id);
              const next = (delta: number) =>
                tabs[(index + delta + tabs.length) % tabs.length]?.id;
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                onSelect(next(1) ?? tab.id);
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                onSelect(next(-1) ?? tab.id);
              } else if (event.key === 'Home') {
                event.preventDefault();
                onSelect(tabs[0]?.id ?? tab.id);
              } else if (event.key === 'End') {
                event.preventDefault();
                onSelect(tabs[tabs.length - 1]?.id ?? tab.id);
              }
            }}
            className={`whitespace-nowrap rounded-md px-3.5 py-2 text-small font-semibold transition-colors
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold
              ${
                selected
                  ? 'bg-ink text-canvas'
                  : 'text-muted hover:bg-ink/5 hover:text-ink'
              }`}
          >
            {tab.label}
            {tab.count && (
              <span className={`ml-1.5 tabular ${selected ? 'text-canvas/70' : 'text-faint'}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={id !== active}
    >
      {children}
    </div>
  );
}
