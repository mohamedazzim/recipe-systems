import {
  parseServingsPrediction,
  buildServingsUserPrompt,
  SERVINGS_SYSTEM_PROMPT,
} from './index';

describe('servings estimation (RS-US)', () => {
  it('parses a valid estimate', () => {
    expect(parseServingsPrediction({ servings: 4 })).toEqual({ ok: true, servings: 4 });
  });

  it('parses a null estimate (no usable signal)', () => {
    expect(parseServingsPrediction({ servings: null })).toEqual({ ok: true, servings: null });
  });

  it('rejects non-integer / out-of-range / missing servings', () => {
    expect(parseServingsPrediction({ servings: 2.5 }).ok).toBe(false);
    expect(parseServingsPrediction({ servings: 0 }).ok).toBe(false);
    expect(parseServingsPrediction({ servings: 100 }).ok).toBe(false);
    expect(parseServingsPrediction({}).ok).toBe(false);
    expect(parseServingsPrediction('nope').ok).toBe(false);
  });

  it('builds an ingredient-list user prompt (name + amount only)', () => {
    const prompt = buildServingsUserPrompt([
      { name: 'Fish', amount: '500g' },
      { name: 'Salt', amount: null },
    ]);
    expect(prompt).toContain('Fish — 500g');
    expect(prompt).toContain('Salt');
    expect(prompt).not.toContain('Salt —');
  });

  it('the system prompt demands a bounded integer estimate, never invention', () => {
    expect(SERVINGS_SYSTEM_PROMPT).toMatch(/between 1 and 99/);
    expect(SERVINGS_SYSTEM_PROMPT).toMatch(/null/);
    expect(SERVINGS_SYSTEM_PROMPT).toMatch(/ESTIMATOR/);
  });
});
