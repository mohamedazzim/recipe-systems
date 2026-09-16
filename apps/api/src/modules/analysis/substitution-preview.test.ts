// D-25A (C7 / RS-US-18) — deterministic substitution-preview classifier unit
// tests. Golden expectations (Recipe_Systems §6 View 4 + §5):
//   tamarind → kudampuli            = identity_shift
//   fish / coconut-body / sour      = structural
//   drumstick / chilli-count        = modular
// The classifier must never invent evidence: no structural/identity evidence
// in the persisted views → modular (same family).

import {
  classifySubstitution,
  type SubstitutionClass,
} from './substitution-preview';

const sub = (ingredient_id: string, substitute: string, consequence = 'X') => ({
  ingredient_id,
  substitute,
  consequence,
  tag: 'INFERRED' as const,
});

function run(input: {
  substitution: ReturnType<typeof sub>;
  ingredientName: string;
  view1?: unknown;
  view5?: unknown;
  view6?: unknown;
}): SubstitutionClass {
  return classifySubstitution({
    substitution: input.substitution,
    ingredientName: input.ingredientName,
    view1: (input.view1 as never) ?? null,
    view5: (input.view5 as never) ?? null,
    view6: (input.view6 as never) ?? null,
  });
}

describe('classifySubstitution (D-25A C7)', () => {
  it('tamarind → kudampuli is identity_shift (View 5 neighbour names the swap)', () => {
    expect(
      run({
        substitution: sub('tamarind-id', 'Kudampuli', 'Kerala meen curry — walks to another coast'),
        ingredientName: 'Tamarind',
        view5: {
          not_this: [
            {
              variant: 'Kerala meen curry',
              key_difference: 'uses kudampuli instead of tamarind/mango, coconut milk-based',
            },
          ],
        },
      }),
    ).toBe('identity_shift');
  });

  it('gingelly oil → coconut oil is identity_shift via the View 5 neighbour key_difference', () => {
    expect(
      run({
        substitution: sub('oil-id', 'Gingelly oil', 'Inland Tamil kuzhambu'),
        ingredientName: 'Coconut Oil',
        view5: {
          not_this: [
            { variant: 'Inland Tamil meen kuzhambu', key_difference: 'gingelly oil instead of coconut oil' },
          ],
        },
      }),
    ).toBe('identity_shift');
  });

  it('fish is structural — View 1 omission consequence states the dish breaks', () => {
    expect(
      run({
        substitution: sub('fish-id', 'Brinjal', 'Vegetarian version; fish texture lost'),
        ingredientName: 'Fish',
        view1: {
          items: [{ ingredient_id: 'fish-id', job: 'Protein, fat', if_omitted: 'Not this dish', tag: 'CARD' }],
        },
      }),
    ).toBe('structural');
  });

  it('coconut body is structural — View 1 omission consequence degrades the dish', () => {
    expect(
      run({
        substitution: sub('coconut-id', 'Coconut milk (reduced quantity)', 'Thinner body'),
        ingredientName: 'Grated Coconut',
        view1: {
          items: [{ ingredient_id: 'coconut-id', job: 'Body and fat', if_omitted: 'Thin tamarind stew, no richness', tag: 'CARD' }],
        },
      }),
    ).toBe('structural');
  });

  it('an ingredient in a View 6 structural ratio is structural (explicit boolean)', () => {
    expect(
      run({
        substitution: sub('chilli-powder-id', 'Kashmiri chilli', 'Milder heat'),
        ingredientName: 'Chilli Powder',
        view6: {
          ratios: [
            { components: 'chilli powder : coriander', ratio: '2 tsp : 1 tsp', structural: true, tag: 'CARD' },
          ],
        },
      }),
    ).toBe('structural');
  });

  it('a View 4 consequence that states the dish breaks is structural even without View 1/6', () => {
    expect(
      run({
        substitution: sub('coconut-id', 'Yoghurt', 'Different dish — the coconut body is gone and the stew is broken'),
        ingredientName: 'Grated Coconut',
        view1: null,
        view5: null,
        view6: null,
      }),
    ).toBe('structural');
  });

  it('a like-for-like fish swap stays modular when no persisted evidence breaks the dish', () => {
    expect(
      run({
        substitution: sub('fish-id', 'Firm white fish', 'Slightly leaner; still a coastal fish curry'),
        ingredientName: 'Fish',
        view1: {
          items: [{ ingredient_id: 'fish-id', job: 'Protein, fat', if_omitted: 'Lighter curry, still this dish', tag: 'CARD' }],
        },
        view5: null,
        view6: null,
      }),
    ).toBe('modular');
  });

  it('drumstick is modular — no structural or identity evidence is persisted', () => {
    expect(
      run({
        substitution: sub('drumstick-id', 'Tomato', 'Less vegetable, same curry'),
        ingredientName: 'Drumstick',
        view1: {
          items: [{ ingredient_id: 'drumstick-id', job: 'Vegetable body', if_omitted: 'Fewer vegetables; still the same curry', tag: 'CARD' }],
        },
        view5: { not_this: [] },
        view6: { ratios: [], unresolvable: [] },
      }),
    ).toBe('modular');
  });

  it('chilli count is modular — no persisted evidence pushes it stronger', () => {
    expect(
      run({
        substitution: sub('chilli-id', 'Fewer green chillies', 'Less heat'),
        ingredientName: 'Chilli',
        view1: {
          items: [{ ingredient_id: 'chilli-id', job: 'Heat', if_omitted: 'Milder curry', tag: 'CARD' }],
        },
        view5: null,
        view6: null,
      }),
    ).toBe('modular');
  });

  it('never invents: missing views default to modular, never a fabricated claim', () => {
    expect(
      run({
        substitution: sub('any-id', 'Anything', 'X'),
        ingredientName: 'Anything',
        view1: null,
        view5: null,
        view6: null,
      }),
    ).toBe('modular');
  });

  it('does not misclassify a modular swap as identity_shift on a coincidental word', () => {
    // "oil" is generic — the identity-shift match requires the neighbour text to
    // name the specific swap (substitute or source ingredient), not a substring
    // of an unrelated word.
    expect(
      run({
        substitution: sub('salt-id', 'Less salt', 'Milder'),
        ingredientName: 'Salt',
        view5: {
          not_this: [
            { variant: 'Kerala meen curry', key_difference: 'coconut-oil tadka instead of gingelly' },
          ],
        },
        view6: { ratios: [], unresolvable: [] },
      }),
    ).toBe('modular');
  });
});
