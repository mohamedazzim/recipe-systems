// D-17: main.ts captures DATABASE_URL at module load. Pin it here so the
// bootstrap wiring is exercised deterministically in both CI (env set) and
// local dev (env unset) — everything network-touching is mocked in unit tests.
// (globalThis.process — the worker's flat eslint config flags bare `process`.)
globalThis.process.env.DATABASE_URL =
  globalThis.process.env.DATABASE_URL || 'postgresql://jest@localhost/jestdb';
