// Session recipe store: localStorage-backed, labeled "this session" data.

import { isOwnedBy, listSessionRecipes, previewOf, recordSessionRecipe } from '@/lib/flow';

describe('session recipe store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts empty', () => {
    expect(listSessionRecipes()).toEqual([]);
  });

  it('records and dedupes by recipe id (newest first)', () => {
    recordSessionRecipe('r1', 'First paste', { kind: 'guest' });
    recordSessionRecipe('r2', 'Second paste', { kind: 'user', accountId: 'acc-1' });
    recordSessionRecipe('r1', 'First paste edited', { kind: 'guest' });
    const list = listSessionRecipes();
    expect(list.map((r) => r.recipe_id)).toEqual(['r1', 'r2']);
    expect(list[0].preview).toBe('First paste edited');
    expect(list[0].owner).toBe('guest');
    expect(list[1].owner).toBe('user:acc-1');
  });

  it('isOwnedBy: identity-tagged records only (regression: cross-session 404)', () => {
    recordSessionRecipe('r1', 'Guest paste', { kind: 'guest' });
    recordSessionRecipe('r2', 'Chef paste', { kind: 'user', accountId: 'acc-1' });
    const all = listSessionRecipes();
    const guestRecipe = all.find((r) => r.recipe_id === 'r1')!;
    const chefRecipe = all.find((r) => r.recipe_id === 'r2')!;
    expect(isOwnedBy(chefRecipe, { kind: 'guest' })).toBe(false);
    expect(isOwnedBy(guestRecipe, { kind: 'guest' })).toBe(true);
    expect(isOwnedBy(chefRecipe, { kind: 'user', accountId: 'acc-1' })).toBe(true);
    expect(isOwnedBy(chefRecipe, { kind: 'user', accountId: 'acc-2' })).toBe(false);
    // legacy records without a tag are conservatively foreign
    window.localStorage.setItem(
      'rs.session.recipes',
      JSON.stringify([{ recipe_id: 'r9', created_at: 'x', preview: 'legacy' }]),
    );
    expect(isOwnedBy(listSessionRecipes()[0], { kind: 'guest' })).toBe(false);
  });

  it('caps previews at 160 characters', () => {
    recordSessionRecipe('r9', 'x'.repeat(300), { kind: 'guest' });
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
