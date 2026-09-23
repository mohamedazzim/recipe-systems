'use client';

// Tomato progress — a live 0→100 loading bar themed as a small tomato with a
// twirling green leaf. Honest: an indeterminate left-to-right sweep (no fake
// percentage) unless a real `value` (0–100) is supplied. The leaf rotates
// around its stem while the tomato rides the leading edge of the fill, so the
// whole marker travels left → right as loading progresses.

export interface TomatoProgressProps {
  /** Accessible label for the loading state (also shown as the visible caption). */
  label?: string;
  /** 0–100 when known; omit for the indeterminate left-to-right sweep. */
  value?: number;
  className?: string;
}

function Leaf() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="tomato-leaf h-3 w-3 text-curry-leaf"
      aria-hidden="true"
    >
      <path
        d="M12 4 C 17 7, 17 12, 12 15 C 7 12, 7 7, 12 4 Z"
        fill="currentColor"
      />
      <path
        d="M12 15 L 12 21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function TomatoProgress({
  label = 'Loading',
  value,
  className = '',
}: TomatoProgressProps) {
  const determinate = typeof value === 'number' && Number.isFinite(value);
  const pct = determinate ? Math.max(0, Math.min(100, value as number)) : null;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct ?? undefined}
      aria-valuetext={pct != null ? `${Math.round(pct)}%` : undefined}
      className={`flex flex-col gap-1.5 ${className}`}
    >
      <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-border bg-canvas">
        <div
          className={`absolute inset-y-0 left-0 rounded-full bg-chili/70 ${
            pct == null ? 'tomato-fill' : ''
          }`}
          style={pct != null ? { width: `${pct}%` } : undefined}
        >
          <span
            aria-hidden="true"
            className="absolute top-1/2 right-0 flex translate-x-1/2 -translate-y-1/2 flex-col items-center"
          >
            <Leaf />
            <span className="-mt-0.5 block h-3.5 w-3.5 rounded-full border border-white/60 bg-chili shadow-sm" />
          </span>
        </div>
      </div>
      <span className="flex items-center justify-between text-caption text-faint">
        <span>{label}</span>
        {pct != null && <span className="tabular">{Math.round(pct)}%</span>}
      </span>
    </div>
  );
}
