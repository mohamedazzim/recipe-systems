// D-16H regression guard: a view that asserts nothing must not be published as
// COMPLETE. It previously satisfied the frozen schema and the grounding validator
// simultaneously, so an empty payload reached the UI and the station card as a
// finished result — the station card printed an empty sequence.
import { validateViewGrounding } from './validator';
import type { StructuredRecipeInput } from '@recipe-systems/schemas';
import type { ViewPayload } from '../prompts/validate';

const CAPTURED = {
  structured_recipe: {
    ingredients: [
      {
        id: 'fish',
        display_name: 'Fish',
        canonical_name: null,
        amount_text: '500g',
        quantity: 500,
        unit: 'g',
        confirmed_sense: null,
        category: 'fish_meat',
        food_id: null,
        include_on_list: true,
      },
    ],
    method_steps: [{ id: 'method-1', text: 'Cook the fish.', source: 'METHOD' }],
    method_source: { name: 'Card', type: 'card', matched: true },
    explicitly_absent: [],
    card_metadata: { photographed: false, legible_issues: [] },
  },
} as unknown as StructuredRecipeInput;

const asPayload = (value: unknown) => value as unknown as ViewPayload;

describe('validateViewGrounding — an empty payload cannot claim COMPLETE', () => {
  it('fails a COMPLETE view that cites nothing', () => {
    const verdict = validateViewGrounding(
      1,
      asPayload({ status: 'COMPLETE', items: [], role_groups: [] }),
      CAPTURED,
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.violations.map((v) => v.code)).toContain('EMPTY_VIEW_PAYLOAD');
    }
  });

  it('fails a COMPLETE view whose only content is an empty collection', () => {
    const verdict = validateViewGrounding(
      3,
      asPayload({ status: 'COMPLETE', stages: [] }),
      CAPTURED,
    );
    expect(verdict.ok).toBe(false);
  });

  it('leaves a view that honestly declares INCOMPLETE alone', () => {
    const verdict = validateViewGrounding(
      4,
      asPayload({ status: 'INCOMPLETE', substitutions: [] }),
      CAPTURED,
    );
    expect(verdict.ok).toBe(true);
  });

  it('still passes a COMPLETE view that asserts something grounded', () => {
    const verdict = validateViewGrounding(
      1,
      asPayload({ status: 'COMPLETE', items: [{ ingredient_id: 'fish', role: 'protein' }] }),
      CAPTURED,
    );
    expect(verdict.ok).toBe(true);
  });
});
