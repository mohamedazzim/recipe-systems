import { LLM_ADAPTER_SEAM } from './index';

describe('llm-adapter package bootstrap', () => {
  it('exposes the provider-neutral seam note (Q9 stays OPEN; no provider selected here)', () => {
    expect(LLM_ADAPTER_SEAM).toMatch(/provider-neutral/);
  });
});
