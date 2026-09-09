// D-17 (P3-3): main() wires pg-boss + the notifier + the handler. Boot behavior
// is exercised by the integration suite (real Postgres); this unit test guards
// only the bootstrap contract: missing DATABASE_URL fails fast, never throws.

import { main } from './main';

describe('analysis-worker bootstrap', () => {
  it('fails fast without DATABASE_URL (no crash, no throw)', async () => {
    const had = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(main()).resolves.toBeUndefined();
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = undefined;
      if (had) process.env.DATABASE_URL = had;
    }
  });
});
