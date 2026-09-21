import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us — Recipe Systems',
  description:
    'Learn about pente.ai, the new product from the Recipe Systems team.',
};

export default function AboutPage() {
  return (
    <div className="min-h-[100dvh] bg-canvas text-body">
      {/* Top bar — mirrors the app shell so the page feels like home. */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="container-rs flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 py-2">
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Recipe Systems
          </Link>
          <nav aria-label="About" className="flex items-center gap-1">
            <Link
              href="/"
              className="rounded-md px-2.5 py-1.5 text-small font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Home
            </Link>
            <span
              aria-current="page"
              className="rounded-md bg-canvas px-2.5 py-1.5 text-small font-medium text-ink"
            >
              About Us
            </span>
          </nav>
        </div>
      </header>

      <main className="container-rs py-12 sm:py-16">
        {/* Hero */}
        <section className="max-w-3xl">
          <p className="eyebrow">From the team behind Recipe Systems</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
            Meet pente.ai — our new product.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-body">
            Recipe Systems taught us something simple: people do their best work
            when the busywork disappears and the thinking stays visible. That
            idea is the seed of{' '}
            <a
              href="https://pente.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-strong underline decoration-accent/40 underline-offset-2 transition-colors hover:text-accent"
            >
              pente.ai
            </a>
            , the next product we are building.
          </p>
        </section>

        {/* What it is */}
        <section className="mt-14 max-w-3xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            What pente.ai is
          </h2>
          <p className="mt-4 leading-relaxed">
            pente.ai is an AI-first platform that takes unstructured, messy,
            real-world input — text, documents, images, scattered notes — and
            turns it into clear, structured, reviewable output. It applies the
            same principles that power Recipe Systems: ground every answer in
            the source material, show where each claim came from, and never let
            the model invent what was not there.
          </p>
          <p className="mt-4 leading-relaxed">
            Where Recipe Systems analyses a single recipe across nine fixed
            views, pente.ai generalises that approach to the broader work of
            understanding anything you bring to it. Analysis, not generation.
            Structure, not guesswork.
          </p>
        </section>

        {/* Principles */}
        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            The principles we carry over
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-display text-lg font-semibold text-ink">
                Grounded, always
              </h3>
              <p className="mt-2 text-small leading-relaxed text-muted">
                Every output traces back to the input it came from. Nothing is
                invented out of thin air.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-display text-lg font-semibold text-ink">
                Human review first
              </h3>
              <p className="mt-2 text-small leading-relaxed text-muted">
                The machine proposes, the person decides. Readiness is explicit,
                never assumed.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-display text-lg font-semibold text-ink">
                Deterministic where it matters
              </h3>
              <p className="mt-2 text-small leading-relaxed text-muted">
                The parts that must be reliable are reproducible and
                reviewable — not a roll of the model&apos;s dice.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-14 max-w-3xl rounded-2xl border border-accent/20 bg-accent/10 p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
            See where we&apos;re headed
          </h2>
          <p className="mt-2 leading-relaxed text-body">
            pente.ai is in active development. Follow along at the official site
            as the product takes shape.
          </p>
          <a
            href="https://pente.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-small font-semibold text-surface transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Visit pente.ai
          </a>
        </section>

        <footer className="mt-16 border-t border-border pt-6 text-caption text-faint">
          <p>© {new Date().getFullYear()} Recipe Systems. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
