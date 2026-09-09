// D-17 (P3-3): main() wiring — mocked pg-boss/pg/database so the test never
// touches the network regardless of whether DATABASE_URL is set (CI sets it,
// local dev does not — the previous un-mocked version connected for real in
// CI and hung the unit step). Boot behavior against real Postgres is covered
// by the integration suite instead.

const mockBossInstance = {
  start: jest.fn().mockResolvedValue(undefined),
  createQueue: jest.fn().mockResolvedValue(undefined),
  work: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
};
const MockBossCtor = jest.fn().mockImplementation(() => mockBossInstance);

jest.mock('pg-boss', () => ({ __esModule: true, default: MockBossCtor }));

const mockClientInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue({ rows: [] }),
  on: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
};
jest.mock('pg', () => ({ Client: jest.fn().mockImplementation(() => mockClientInstance) }));

const mockPrisma = { $disconnect: jest.fn().mockResolvedValue(undefined) };
jest.mock('@recipe-systems/database', () => ({ prisma: mockPrisma }));

const mockHandle = jest.fn().mockResolvedValue(undefined);
const mockSweep = jest.fn().mockResolvedValue(0);
class MockHandler {
  handle = mockHandle;
  sweepStaleGenerating = mockSweep;
}
jest.mock('./analysis-job.handler', () => ({
  AnalysisJobHandler: MockHandler,
  ANALYSIS_EVENTS_CHANNEL: 'recipe_analysis_events',
}));

const mockAdapter = { generate: jest.fn() };
jest.mock('./adapter', () => ({ resolveAdapter: jest.fn().mockReturnValue(mockAdapter) }));

import { main } from './main';

describe('analysis-worker bootstrap wiring (mocked — no network)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockBossCtor.mockImplementation(() => mockBossInstance);
    mockBossInstance.start.mockResolvedValue(undefined);
    mockBossInstance.createQueue.mockResolvedValue(undefined);
    mockBossInstance.work.mockResolvedValue(undefined);
    mockSweep.mockResolvedValue(0);
    mockHandle.mockResolvedValue(undefined);
  });

  it('wires boss + sweep + work on the "analysis" queue when DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ci@localhost/db';
    await expect(main()).resolves.toBeUndefined();

    expect(MockBossCtor).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: expect.any(String) }),
    );
    expect(mockBossInstance.start).toHaveBeenCalled();
    expect(mockBossInstance.createQueue).toHaveBeenCalledWith('analysis');
    expect(mockSweep).toHaveBeenCalled();
    expect(mockBossInstance.work).toHaveBeenCalledWith('analysis', expect.any(Function));
  });

  it('the work callback iterates pg-boss batches and hands each payload to the handler', async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ci@localhost/db';
    await main();

    const workHandler = mockBossInstance.work.mock.calls[0][1];
    await workHandler([
      { id: 'j1', data: { analysis_id: 'a1', recipe_id: 'r1', mode: 'home', prompt_version: 'v2', captured: {} } },
      { id: 'j2', data: { analysis_id: 'a2', recipe_id: 'r1', mode: 'chef', prompt_version: 'v2', captured: {} } },
    ]);

    expect(mockHandle).toHaveBeenCalledTimes(2);
    expect(mockHandle).toHaveBeenNthCalledWith(1, expect.objectContaining({ analysis_id: 'a1' }));
    expect(mockHandle).toHaveBeenNthCalledWith(2, expect.objectContaining({ analysis_id: 'a2' }));
  });

  it('fails fast without DATABASE_URL (exitCode 1, never throws) in a fresh module', async () => {
    const realUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = '';
    let result: unknown;
    await jest.isolateModulesAsync(async () => {
      const mod = await import('./main');
      result = await mod.main();
    });
    expect(result).toBeUndefined();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    if (realUrl !== undefined) process.env.DATABASE_URL = realUrl;
    else delete process.env.DATABASE_URL;
  });
});
