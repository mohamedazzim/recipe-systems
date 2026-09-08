export interface SpinnerProps {
  /** Accessible label for the loading state. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-8 w-8 border-[3px]' };

/** Quiet, purposeful loading indicator — always paired with an accessible label. */
export function Spinner({ label = 'Loading', size = 'md', className = '' }: SpinnerProps) {
  return (
    <span role="status" className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className={`inline-block animate-spin rounded-full border-accent/25 border-t-accent ${sizes[size]}`}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <main className="container-rs flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Spinner size="lg" label={label} />
      <p className="text-small text-muted">{label}</p>
    </main>
  );
}
