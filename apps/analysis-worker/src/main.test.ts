import { main } from './main';

describe('analysis-worker bootstrap', () => {
  it('exposes a runnable skeleton main (no analysis logic before D-17)', () => {
    expect(typeof main).toBe('function');
    expect(() => main()).not.toThrow();
  });
});
