'use client';

// Minimal accessible dialog primitive — the UI kit had none. Escape closes it,
// focus moves into the panel on open, and it is announced as a modal dialog.

import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Called on Escape (omit for a modal the user must answer). */
  onClose?: () => void;
}

export function Modal({ open, title, description, children, onClose }: ModalProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // The overlay is a non-scrolling fixed box, so a panel taller than a short
        // or keyboard-squeezed viewport used to clip its actions off both edges with
        // no way to reach them. Cap it and let the panel itself scroll.
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-card focus:outline-none sm:p-6"
      >
        <h2 id={titleId} className="font-display text-h3 text-ink">
          {title}
        </h2>
        {description && <p className="mt-2 text-small text-body">{description}</p>}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}
