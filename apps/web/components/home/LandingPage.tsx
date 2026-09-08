'use client';

// Public entry / product landing page — Decide surface, one idea per section.
// Job: say what Recipe Systems does, offer one primary action, keep the auth
// paths secondary, and establish the visual identity. Deliberately short:
// the nine views get a mention here, not a briefing (that happens in the app).

import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Typography';
import { Alert } from '@/components/ui/Alert';

const STEPS = [
  { n: '1', title: 'Enter a recipe', body: 'Typed, pasted, or photographed.' },
  { n: '2', title: 'Review the parse', body: 'Confirm the structured lines before analysis.' },
  { n: '3', title: 'Explore nine views', body: 'One briefing, nine fixed perspectives.' },
];

export interface LandingPageProps {
  /** Auth or guest-session error surfaced for this page (already URI-decoded). */
  error: string | null;
  errorTitle: string;
  onStartGuest: () => void;
  onStartLogin: () => void;
  onStartSignup: () => void;
}

export function LandingPage({
  error,
  errorTitle,
  onStartGuest,
  onStartLogin,
  onStartSignup,
}: LandingPageProps) {
  return (
    <div className="container-rs">
      {/* Slim top bar — wordmark only; every action lives in one clear place below. */}
      <header className="flex min-h-16 items-center border-b border-border">
        <p className="font-display text-lg font-semibold tracking-tight text-ink">
          Recipe Systems
        </p>
      </header>

      {error && (
        <div className="mt-6">
          <Alert tone="error" title={errorTitle}>
            {error}
          </Alert>
        </div>
      )}

      {/* Hero — the product in one viewport: what it is, one primary action. */}
      <section className="pb-10 pt-12 sm:pt-14">
        <Eyebrow>Recipe analysis</Eyebrow>
        <h1 className="mt-4 max-w-2xl font-display text-display text-ink">
          Understand why this recipe works.
        </h1>
        <p className="mt-5 max-w-prose text-lg leading-relaxed text-body">
          Recipe Systems analyses a recipe, typed, pasted, or photographed, into a structured
          briefing across nine fixed views. Analysis, not generation.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onStartGuest}>
            Analyze a recipe
          </Button>
          <Button size="lg" variant="outline" onClick={onStartLogin}>
            Sign in
          </Button>
        </div>
        <p className="mt-4 text-small text-muted">
          No account needed: analyze as a guest and claim your work onto an account later.
        </p>
      </section>

      {/* How it works — three steps, one short clause per step. */}
      <section className="border-t border-border py-10" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="font-display text-h2 text-ink">
          How it works
        </h2>
        <div className="mt-5 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="space-y-1.5">
              <p aria-hidden="true" className="font-display text-3xl font-semibold text-gold">
                {step.n}
              </p>
              <h3 className="text-h3 font-sans text-ink">{step.title}</h3>
              <p className="text-small text-body">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Account story — one CTA (the single sign-up path). */}
      <section className="mb-4 rounded-lg border border-border bg-ink px-6 py-8 text-center sm:px-10">
        <h2 className="font-display text-h2 text-canvas">Keep what you learn.</h2>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={onStartSignup}>Create account</Button>
        </div>
      </section>

      <footer className="pb-8">
        <p className="text-caption text-faint">
          Recipe Systems is an analysis tool. It reads recipes. It does not write them.
        </p>
      </footer>
    </div>
  );
}
