import { RENDER_RULE } from './index';

describe('rendering package bootstrap', () => {
  it('carries the snapshot-only rule (read-only renderer, INV-12)', () => {
    expect(RENDER_RULE).toMatch(/snapshot-only/);
  });
});
