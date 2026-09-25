import { VideoService } from './video.service';
import type { RecipeService } from '../recipes/recipe.service';
import type { IntakeService } from '../intake/intake.service';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';

const userActor: Actor = {
  kind: 'user',
  user: { accountId: 'acc-1', email: 'chef@test.dev', sub: 's1' },
};

/** Let the fire-and-forget generation run to completion. */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function service(opts: {
  propose?: unknown;
  chapters?: unknown;
  oembedOk?: boolean;
}) {
  const prisma: any = {
    recipeVideo: {
      findUnique: jest.fn().mockResolvedValue(null),
      // BUG-018: start() reads the row back for the fencing token, and the run's final writes
      // are conditional on it — so they are updateMany and report whether the row was still
      // theirs. The upsert has to hand back a token for the same reason.
      upsert: jest.fn().mockResolvedValue({ updatedAt: new Date('2026-09-20T00:00:00.000Z') }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const recipes = {
    assertOwned: jest.fn().mockResolvedValue({ id: 'r1', title: 'Meen Kuzhambu' }),
    identificationFamily: jest.fn().mockResolvedValue(null),
  } as unknown as RecipeService;
  const intake = {
    listDraftLines: jest.fn().mockResolvedValue([{ displayName: 'Fish' }]),
  } as unknown as IntakeService;
  const llm: any = {
    modelVersion: 'gemini:test',
    proposeRecipeVideo: jest.fn().mockResolvedValue(opts.propose ?? { video: null }),
    describeVideoChapters: jest.fn().mockResolvedValue(opts.chapters ?? { chapters: [] }),
  };
  const oembedOk = opts.oembedOk ?? true;
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue(
    oembedOk
      ? { ok: true, json: async () => ({ title: 'Real video', author_name: 'A Kitchen' }) }
      : { ok: false, json: async () => ({}) },
  );
  const svc = new VideoService(prisma, recipes, intake, llm);
  return { svc, prisma, llm };
}

describe('VideoService (RS-US chef mode)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('verifies the proposed video with oEmbed BEFORE storing it', async () => {
    const { svc, prisma, llm } = service({
      propose: { video: { id: 'iV651XRxquM', title: 'model title' } },
      chapters: { chapters: [{ start: '01:20', title: 'Boil', summary: 'simmer' }] },
    });

    await svc.start(userActor, 'r1');
    await flush();

    // The model's title is NOT trusted — the oEmbed title is stored.
    const data = prisma.recipeVideo.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('ready');
    expect(data.videoId).toBe('iV651XRxquM');
    expect(data.title).toBe('Real video');
    expect(data.chapters).toEqual([
      { start: '01:20', seconds: 80, title: 'Boil', summary: 'simmer' },
    ]);
    expect(llm.describeVideoChapters).toHaveBeenCalledWith(
      expect.objectContaining({ video_url: 'https://www.youtube.com/watch?v=iV651XRxquM' }),
    );
  });

  it('never stores a video that fails verification (a hallucinated id is dropped)', async () => {
    const { svc, prisma, llm } = service({
      propose: { video: { id: 'iV651XRxquM', title: 'model title' } },
      oembedOk: false,
    });

    await svc.start(userActor, 'r1');
    await flush();

    // Read the video at all only after it was proven to exist.
    expect(llm.describeVideoChapters).not.toHaveBeenCalled();
    const data = prisma.recipeVideo.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('failed');
    expect(String(data.error)).toMatch(/no verifiable youtube video/i);
  });

  it('fails cleanly when the model has no confident answer', async () => {
    const { svc, prisma, llm } = service({ propose: { video: null } });

    await svc.start(userActor, 'r1');
    await flush();

    expect(llm.describeVideoChapters).not.toHaveBeenCalled();
    expect(prisma.recipeVideo.updateMany.mock.calls[0][0].data.status).toBe('failed');
  });

  it('does not re-run the provider when a ready walkthrough already exists', async () => {
    const { svc, prisma, llm } = service({});
    prisma.recipeVideo.findUnique.mockResolvedValue({
      status: 'ready',
      videoId: 'iV651XRxquM',
      videoUrl: 'https://www.youtube.com/watch?v=iV651XRxquM',
      title: 'Real video',
      channel: 'A Kitchen',
      chapters: [{ start: '00:00', seconds: 0, title: 'Intro', summary: '' }],
      error: null,
      updatedAt: new Date(),
    });

    const state = await svc.start(userActor, 'r1');

    expect(state.status).toBe('ready');
    expect(llm.proposeRecipeVideo).not.toHaveBeenCalled();
    expect(prisma.recipeVideo.upsert).not.toHaveBeenCalled();
  });
});
