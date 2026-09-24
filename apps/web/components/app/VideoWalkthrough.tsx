'use client';

// RS-US (chef mode): the dish video walkthrough.
//
// The video is THIRD-PARTY YouTube content found for the dish (proposed by the
// model, verified to exist before it is ever shown) — it is NOT from the recipe
// card, and the surface says so. The steps on the right are read from that video
// by the provider, with the real timestamp each one begins at; tapping a step
// seeks the player. Generation is async: this view starts it when needed and
// polls until it is ready.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CaretRight, Play } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import type { WireLine } from '@/lib/types';

export interface VideoChapter {
  start: string;
  seconds: number;
  title: string;
  summary: string;
}

export interface VideoWalkthroughWire {
  status: 'absent' | 'generating' | 'ready' | 'failed';
  video: { id: string; url: string; title: string; channel: string | null } | null;
  chapters: VideoChapter[];
  error: string | null;
}

/** How often the view re-reads while the walkthrough is generating. */
const POLL_MS = 4000;

export interface VideoWalkthroughProps {
  recipeId: string;
  title: string;
  /** The corrected ingredient lines — the "materials" chips. */
  lines: WireLine[];
  signedIn: boolean;
  onBack: () => void;
}

export function VideoWalkthrough({
  recipeId,
  title,
  lines,
  signedIn,
  onBack,
}: VideoWalkthroughProps) {
  const [state, setState] = useState<VideoWalkthroughWire | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const playerRef = useRef<HTMLIFrameElement | null>(null);

  const playerMessage = useCallback((func: string, args: unknown[]): void => {
    const frame = playerRef.current;
    if (!frame?.contentWindow) return;
    // The embed is loaded with enablejsapi=1, so commands ride postMessage —
    // no third-party player script has to be loaded on the page.
    frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }, []);

  const seekTo = useCallback(
    (seconds: number): void => {
      playerMessage('seekTo', [seconds, true]);
      playerMessage('playVideo', []);
    },
    [playerMessage],
  );

  const read = useCallback(async (): Promise<VideoWalkthroughWire | null> => {
    try {
      const next = await api<VideoWalkthroughWire>(`/recipes/${recipeId}/video-walkthrough`);
      setState(next);
      setError(null);
      return next;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load the video walkthrough',
      );
      return null;
    }
  }, [recipeId]);

  const start = useCallback(async (): Promise<void> => {
    try {
      setState({ status: 'generating', video: null, chapters: [], error: null });
      await api(`/recipes/${recipeId}/video-walkthrough`, { method: 'POST' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the walkthrough');
    }
  }, [recipeId]);

  // Load once; kick off generation when there is nothing usable yet.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await read();
      if (cancelled || !current) return;
      if (current.status === 'absent' || current.status === 'failed') await start();
    })();
    return () => {
      cancelled = true;
    };
  }, [read, start]);

  // Poll only while generating, and stop as soon as it lands. A FAILED read must
  // not end the loop: `read` leaves `state` untouched on error, so relying on the
  // state change alone stopped polling permanently after one dropped request and
  // left the user on an endless spinner with no way forward. The tick forces the
  // effect to reschedule either way; the loop still ends on ready/failed.
  const [pollTick, setPollTick] = useState(0);
  useEffect(() => {
    if (state?.status !== 'generating') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const next = await read();
      if (cancelled) return;
      if (next && (next.status === 'ready' || next.status === 'failed')) return;
      setPollTick((tick) => tick + 1);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, read, pollTick]);

  const chapters = state?.chapters ?? [];
  const active = chapters[Math.min(current, Math.max(chapters.length - 1, 0))];
  const video = state?.video ?? null;

  const go = (index: number): void => {
    if (chapters.length === 0) return;
    const bounded = Math.min(Math.max(index, 0), chapters.length - 1);
    setCurrent(bounded);
    seekTo(chapters[bounded].seconds);
  };

  return (
    <div className="max-w-none">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to the analysis
      </button>

      {error && <p className="mt-4 text-small text-negative">{error}</p>}

      {!signedIn && (
        <p className="mt-4 text-small text-muted">
          Sign in to build a video walkthrough for this dish.
        </p>
      )}

      {signedIn && state === null && error && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5">
          <p className="text-small font-semibold text-ink">Could not load the walkthrough</p>
          <p className="mt-1 text-small text-muted">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void start()}>
            Try again
          </Button>
        </div>
      )}

      {signedIn && state !== null && state.status === 'generating' && (
        <div className="mt-6 flex items-center gap-3">
          <Spinner />
          <p className="text-small text-muted">
            Finding a video for this dish and reading its steps — this takes a moment.
          </p>
        </div>
      )}

      {signedIn && state !== null && state.status === 'generating' && error && (
        <div className="mt-2 flex items-center gap-3">
          <p className="text-small text-negative">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void start()}>
            Try again
          </Button>
        </div>
      )}

      {signedIn && state?.status === 'failed' && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5">
          <p className="text-small font-semibold text-ink">No walkthrough for this dish yet</p>
          <p className="mt-1 text-small text-muted">
            {state.error ?? 'No verifiable video was found.'}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void start()}>
            Try again
          </Button>
        </div>
      )}

      {signedIn && state?.status === 'ready' && video && (
        <>
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
            {/* Player */}
            <div>
              <div className="relative overflow-hidden rounded-[1.25rem] border border-border bg-ink shadow-whisper">
                <div className="relative aspect-video w-full">
                  <iframe
                    ref={playerRef}
                    title={video.title || `${title} video`}
                    src={`https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&rel=0`}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5">
                  <span className="truncate text-caption font-semibold text-surface">
                    {active ? `Chapter ${current + 1}: ${active.title}` : 'Video walkthrough'}
                  </span>
                  <span className="shrink-0 text-caption text-surface/60">third-party video</span>
                </div>
              </div>

              <p className="mt-5 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-accent">
                Chef mode · video walkthrough
              </p>
              <h2 className="mt-2 font-display text-h2 text-ink">{title}</h2>
              <p className="mt-1.5 text-small text-body">
                Follow along with the video. Tap any step to jump to that point.
              </p>
              <p className="mt-1 text-caption text-faint">
                Not from your card — a third-party video found for this dish
                {video.channel ? ` (${video.channel})` : ''}.
              </p>

              {lines.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Ingredients">
                  {lines.slice(0, 12).map((line) => (
                    <li
                      key={line.id}
                      className="rounded-full border border-border bg-surface px-3 py-1 text-caption text-body"
                    >
                      {line.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Steps */}
            <aside className="rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h3 className="font-display text-h3 text-ink">Instructions</h3>
                <span className="text-caption text-faint">
                  Step {chapters.length === 0 ? 0 : current + 1} of {chapters.length}
                </span>
              </div>

              {chapters.length === 0 ? (
                <p className="px-5 py-4 text-small text-muted">
                  This video did not break into steps.
                </p>
              ) : (
                <ol className="divide-y divide-border">
                  {chapters.map((chapter, index) => {
                    const isActive = index === current;
                    return (
                      <li key={`${chapter.start}-${index}`} className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => go(index)}
                          aria-current={isActive ? 'step' : undefined}
                          className={`flex w-full items-start gap-3 text-left ${
                            isActive ? 'text-ink' : 'text-body hover:text-ink'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-caption font-semibold ${
                              isActive
                                ? 'border-accent bg-accent text-surface'
                                : 'border-border-strong text-muted'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="font-semibold leading-snug">{chapter.title}</span>
                              <span className="shrink-0 text-caption tabular text-faint">
                                {chapter.start}
                              </span>
                            </span>
                            {isActive && chapter.summary && (
                              <span className="mt-1 block rounded-md border border-border bg-surface px-3 py-2 text-caption text-muted">
                                {chapter.summary}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={() => go(current - 1)}
                  disabled={current === 0}
                  className="inline-flex min-h-11 items-center px-3 text-caption font-semibold text-muted hover:text-ink disabled:text-faint"
                >
                  Previous
                </button>
                <Button
                  size="sm"
                  onClick={() => go(current + 1)}
                  disabled={current >= chapters.length - 1}
                >
                  <span className="inline-flex items-center gap-1.5">
                    Next step
                    <CaretRight size={12} aria-hidden="true" weight="bold" />
                  </span>
                </Button>
              </div>
            </aside>
          </div>

          <p className="mt-6 inline-flex items-center gap-1.5 text-caption text-faint">
            <Play size={12} aria-hidden="true" weight="fill" />
            Steps and timestamps are read from the video itself.
          </p>
        </>
      )}
    </div>
  );
}
