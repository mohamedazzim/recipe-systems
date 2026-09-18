'use client';

// Public entry / product landing page — Decide surface, one idea per section.
// Job: say what Recipe Systems does, offer one primary action, keep the auth
// paths secondary, and establish the visual identity. Deliberately short:
// the nine views get a mention here, not a briefing (that happens in the app).

import { ArrowRight, Clock, Flask, ListChecks } from '@phosphor-icons/react';
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
    <div>
      {error && (
        <div className="mb-6">
          <Alert tone="error" title={errorTitle}>
            {error}
          </Alert>
        </div>
      )}

      {/* Hero — the product in one viewport: what it is, one primary action. */}
      <section className="pb-10 pt-2 sm:pt-4">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
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
          </div>

          {/* Before → after preview — fills the blank space on large screens only. */}
          <div className="hidden lg:block" aria-label="Recipe before and after">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-4">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted">
                  Pasted in
                </p>
                <p className="mt-2 whitespace-pre-line font-mono text-small leading-relaxed text-body">
                  {'Meen Kuzhambu\nFish 500g\nTamarind, a lime-sized ball\nFenugreek seeds 1 tsp\nSimmer 20 min until thick…'}
                </p>
              </div>

              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-positive/15 text-positive">
                <ArrowRight size={16} aria-hidden="true" weight="bold" />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted">
                  Nine views out
                </p>

                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                  <ListChecks size={16} aria-hidden="true" className="shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="text-small font-semibold text-ink">Ingredients</p>
                    <p className="truncate text-caption text-muted">Fish, tamarind, fenugreek — 3 items</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                  <Clock size={16} aria-hidden="true" className="shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="text-small font-semibold text-ink">Timing</p>
                    <p className="truncate text-caption text-muted">1 active step, 20 min simmer</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                  <Flask size={16} aria-hidden="true" className="shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="text-small font-semibold text-ink">Technique</p>
                    <p className="truncate text-caption text-muted">Simmer — no fry or roast steps</p>
                  </div>
                </div>

                <p className="text-center text-caption text-faint">+6 more views</p>
              </div>
            </div>
          </div>
        </div>
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
