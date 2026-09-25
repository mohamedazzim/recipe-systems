// RS-US (chef mode): the dish video walkthrough.
//
// Discovery is LLM-proposed and then VERIFIED against YouTube (oEmbed) before
// anything is stored or shown — the model's URL is a candidate, never a fact.
// The provider work (~30s proposal + ~8s video read) runs in the BACKGROUND: it
// is far past the edge ceiling for a synchronous request, so the screen is
// `generating` and the UI re-reads. Nothing here is a claim about the captured
// recipe — the video is third-party content and is labelled as such.

import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma, PrismaClient } from '@recipe-systems/database';
import {
  LlmAdapter,
  VIDEO_PROMPT_VERSION,
  parseVideoChapters,
  parseVideoProposal,
  type VideoChapter,
} from '@recipe-systems/llm-adapter';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { IntakeService } from '../intake/intake.service';
import { RecipeService, UNTITLED_RECIPE } from '../recipes/recipe.service';
import { LLM_ADAPTER } from '../llm/llm.module';

/** A `generating` row older than this is treated as abandoned (the process died
 *  mid-generation) so the screen can start over instead of spinning forever. */
export const VIDEO_STALE_MS = 3 * 60_000;

/** The oEmbed verification call must not hang the background job. */
const VERIFY_TIMEOUT_MS = 8_000;

export type VideoStatus = 'absent' | 'generating' | 'ready' | 'failed';

export interface VideoWalkthroughState {
  status: VideoStatus;
  video: { id: string; url: string; title: string; channel: string | null } | null;
  chapters: VideoChapter[];
  error: string | null;
}

/** The columns this service reads (keeps the Prisma model type out of the seam). */
interface RecipeVideoRow {
  status: string;
  videoId: string | null;
  videoUrl: string | null;
  title: string | null;
  channel: string | null;
  chapters: unknown;
  error: string | null;
}

@Injectable()
export class VideoService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly recipes: RecipeService,
    private readonly intake: IntakeService,
    /** The LLM adapter (null = no provider). The walkthrough is an optional
     *  capability, so no provider means a clear failure, never a fake result. */
    @Optional() @Inject(LLM_ADAPTER) private readonly llm?: LlmAdapter | null,
  ) {}

  /** Read the persisted walkthrough (never generates). */
  async get(actor: Actor, recipeId: string): Promise<VideoWalkthroughState> {
    await this.recipes.assertOwned(actor, recipeId);
    const row = await this.prisma.recipeVideo.findUnique({ where: { recipeId } });
    return this.toState(row);
  }

  /**
   * Start (or resume) the walkthrough. An already-`ready` row, or a generation
   * still in flight, is returned as-is — opening the screen repeatedly must not
   * re-run the provider.
   */
  async start(actor: Actor, recipeId: string): Promise<VideoWalkthroughState> {
    await this.recipes.assertOwned(actor, recipeId);
    const existing = await this.prisma.recipeVideo.findUnique({ where: { recipeId } });
    const staleBefore = new Date(Date.now() - VIDEO_STALE_MS);
    const usable =
      existing?.status === 'ready' ||
      (existing?.status === 'generating' && existing.updatedAt > staleBefore);
    if (existing && usable) return this.toState(existing);

    // BUG-018: the row's updatedAt after this write is this run's fencing token. Nothing else
    // writes this row, so it is stable for the life of the run and changes the moment another
    // start claims the recipe.
    const attempt = await this.prisma.recipeVideo.upsert({
      where: { recipeId },
      create: { recipeId, status: 'generating' },
      update: { status: 'generating', error: null },
      select: { updatedAt: true },
    });
    // Fire-and-forget: the request must not wait on ~40s of provider work.
    void this.generate(actor, recipeId, attempt.updatedAt);
    return { status: 'generating', video: null, chapters: [], error: null };
  }

  /** The background job: propose → VERIFY → read the video → persist. */
  // BUG-018: `attempt` is the fencing token — the row's updatedAt as start() wrote it.
  // Generation is ~40s of provider work behind a fire-and-forget call, and start() treats a
  // `generating` row older than VIDEO_STALE_MS as abandoned so a reload can start a new run.
  // Without a token, the superseded run writes last and wins: it overwrites the newer video,
  // or worse, its late failure flips a `ready` row back to `failed` — the user sees a
  // completed walkthrough turn into an error. Both final writes are now conditional on the
  // token, so a superseded run matches zero rows and its result is discarded.
  private async generate(actor: Actor, recipeId: string, attempt: Date): Promise<void> {
    try {
      if (!this.llm) throw new Error('No LLM provider is configured for the video walkthrough');
      const recipe = await this.recipes.assertOwned(actor, recipeId);
      const lines = await this.intake.listDraftLines(actor, recipeId);
      // The intake title is a placeholder until the recipe is saved, so fall back
      // to the identification family (the canonical default name), then to the
      // first draft line (a pasted card usually opens with the dish name).
      const family = await this.recipes.identificationFamily(recipeId);
      const dish =
        [recipe.title, family, lines[0]?.displayName]
          .find((c) => c && c.trim() && c.trim() !== UNTITLED_RECIPE)
          ?.trim() ?? 'this dish';
      const ingredients = lines.map((l) => l.displayName);

      // 1. Propose — and verify. A candidate that does not resolve to a real,
      //    public video is discarded; one retry covers a bad first recall.
      let verified: { id: string; title: string; channel: string | null } | null = null;
      for (let attempt = 0; attempt < 2 && !verified; attempt += 1) {
        const raw = await this.llm.proposeRecipeVideo({
          dish,
          ingredients,
          prompt_version: VIDEO_PROMPT_VERSION,
          model_version: this.llm.modelVersion ?? 'unknown',
        });
        const parsed = parseVideoProposal(raw);
        if (!parsed.ok || !parsed.video) break; // no confident answer → stop
        verified = await this.verifyYouTube(parsed.video.video_id);
      }
      if (!verified) {
        throw new Error('No verifiable YouTube video was found for this dish');
      }

      // 2. Read the video itself into timestamped steps.
      const videoUrl = `https://www.youtube.com/watch?v=${verified.id}`;
      const rawChapters = await this.llm.describeVideoChapters({
        video_url: videoUrl,
        dish,
        prompt_version: VIDEO_PROMPT_VERSION,
        model_version: this.llm.modelVersion ?? 'unknown',
      });
      const parsedChapters = parseVideoChapters(rawChapters);
      if (!parsedChapters.ok) {
        throw new Error(`The video breakdown was invalid: ${parsedChapters.errors.join('; ')}`);
      }

      const settled = await this.prisma.recipeVideo.updateMany({
        where: { recipeId, updatedAt: attempt },
        data: {
          status: 'ready',
          videoId: verified.id,
          videoUrl,
          title: verified.title,
          channel: verified.channel,
          chapters: parsedChapters.chapters as unknown as Prisma.InputJsonValue,
          error: null,
        },
      });
      if (settled.count === 0) {
        console.log(
          `video walkthrough for recipe ${recipeId}: superseded by a newer attempt — result discarded`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The video walkthrough failed';
      // Conditional too: a superseded run must not report failure over a newer success.
      await this.prisma.recipeVideo
        .updateMany({
          where: { recipeId, updatedAt: attempt },
          data: { status: 'failed', error: message.slice(0, 500) },
        })
        .catch(() => undefined);
    }
  }

  /**
   * Confirm the candidate is a REAL, public YouTube video via oEmbed (no key
   * needed): 200 + a title means it exists. This is the guard that stops a
   * hallucinated id from ever being stored or shown.
   */
  private async verifyYouTube(
    videoId: string,
  ): Promise<{ id: string; title: string; channel: string | null } | null> {
    const target = `https://www.youtube.com/watch?v=${videoId}`;
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
      if (!res.ok) return null;
      const body = (await res.json()) as { title?: unknown; author_name?: unknown };
      if (typeof body.title !== 'string' || body.title.trim().length === 0) return null;
      return {
        id: videoId,
        title: body.title.trim(),
        channel: typeof body.author_name === 'string' ? body.author_name : null,
      };
    } catch {
      return null;
    }
  }

  private toState(row: RecipeVideoRow | null): VideoWalkthroughState {
    if (!row) return { status: 'absent', video: null, chapters: [], error: null };
    const chapters = Array.isArray(row.chapters) ? (row.chapters as VideoChapter[]) : [];
    const video =
      row.videoId && row.videoUrl
        ? { id: row.videoId, url: row.videoUrl, title: row.title ?? '', channel: row.channel }
        : null;
    return {
      status: row.status as VideoStatus,
      video,
      chapters,
      error: row.error,
    };
  }
}
