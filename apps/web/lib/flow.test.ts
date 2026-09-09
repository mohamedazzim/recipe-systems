// Session recipe store: localStorage-backed, labeled "this session" data.

import { listSessionRecipes, previewOf, recordSessionRecipe } from '@/lib/flow';

describe('session recipe store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts empty', () => {
    expect(listSessionRecipes()).toEqual([]);
  });

  it('records and dedupes by recipe id (newest first)', () => {
    recordSessionRecipe('r1', 'First paste');
    recordSessionRecipe('r2', 'Second paste');
    recordSessionRecipe('r1', 'First paste edited');
    const list = listSessionRecipes();
    expect(list.map((r) => r.recipe_id)).toEqual(['r1', 'r2']);
    expect(list[0].preview).toBe('First paste edited');
  });

  it('caps previews at 160 characters', () => {
    recordSessionRecipe('r9', 'x'.repeat(300));
    const list = listSessionRecipes();
    expect(list[0].preview).toHaveLength(163);
    expect(list[0].preview.endsWith('...')).toBe(true);
  });

  it('ignores corrupted storage', () => {
    window.localStorage.setItem('rs.session.recipes', '{not json');
    expect(listSessionRecipes()).toEqual([]);
  });

  it('previewOf takes the first non-empty trimmed line', () => {
    expect(previewOf('\n  Meen Kuzhambu  \nFish 500g\n')).toBe('Meen Kuzhambu');
    expect(previewOf('')).toBe('Untitled paste');
  });
});
