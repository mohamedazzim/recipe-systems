// Session recipe store: localStorage-backed, labeled "this session" data.

import { claimSessionRecords, isOwnedBy, listSessionRecipes, previewOf, recordSessionRecipe, sessionRecipeLines } from '@/lib/flow';
import type { WireLine } from '@/lib/types';

const sampleLine: WireLine = {
  id: 'l1',
  line_no: 1,
  display_name: 'Fish — 500g',
  amount: null,
  unit: null,
  quantity: null,
  category: null,
  confirmed_sense: null,
  include_on_list: true,
  is_header: false,
  needs_review: false,
  ocr_confidence: null,
  source_tag: 'CARD',
  updated_at: '2026-09-10T00:00:00.000Z',
};

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

  it('keeps the parse lines for guest-created recipes only (QA-B1 reopen)', () => {
    recordSessionRecipe('rg', 'Guest paste', { kind: 'guest' }, [sampleLine]);
    recordSessionRecipe('ru', 'User paste', { kind: 'user', accountId: 'acc-1' }, [sampleLine]);
    expect(sessionRecipeLines('rg')).toEqual([sampleLine]);
    expect(sessionRecipeLines('ru')).toBeNull();
    expect(sessionRecipeLines('missing')).toBeNull();
    const stored = listSessionRecipes();
    expect(stored.find((r) => r.recipe_id === 'rg')?.lines).toEqual([sampleLine]);
    expect(stored.find((r) => r.recipe_id === 'ru')?.lines).toBeUndefined();
  });

  it('claimSessionRecords re-tags guest records to the account (QA-B2 UI move)', () => {
    recordSessionRecipe('rg1', 'Guest A', { kind: 'guest' }, [sampleLine]);
    recordSessionRecipe('rg2', 'Guest B', { kind: 'guest' });
    recordSessionRecipe('ru1', 'User A', { kind: 'user', accountId: 'acc-1' });
    expect(claimSessionRecords('acc-9')).toBe(2);
    const list = listSessionRecipes();
    expect(list.find((r) => r.recipe_id === 'rg1')?.owner).toBe('user:acc-9');
    expect(list.find((r) => r.recipe_id === 'rg2')?.owner).toBe('user:acc-9');
    expect(list.find((r) => r.recipe_id === 'ru1')?.owner).toBe('user:acc-1');
    // the stored lines survive the re-tag
    expect(list.find((r) => r.recipe_id === 'rg1')?.lines).toEqual([sampleLine]);
    // idempotent once nothing is guest-tagged
    expect(claimSessionRecords('acc-9')).toBe(0);
  });
});
