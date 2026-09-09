// D-16 (P3-2) golden-fixture integration — DISPATCH done criterion 1:
// "Golden fixture passes: every claim resolves or is ABSENT; no ginger/garlic
// anywhere (golden invariants)."
//
// Builds the captured state directly from the REAL golden fixture
// (tests/fixtures/golden_kanyakumari_card.json): card.lines → ingredient ids,
// expected.absent (garlic, ginger) → the sanctioned ABSENT channel. Then:
//   - hand-checked GOLDEN CLAIMS (grounded in the fixture's own expected data)
//     all validate green;
//   - plant garlic/ginger as positive references → the validator catches every
//     one (the A-16 sharpest check);
//   - the two fenugreek lines remain structurally distinct (golden invariant).
// No DB needed — the validator is a pure function over the frozen schema.

/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs';
import path from 'path';
import { Claim, StructuredRecipeInput } from '@recipe-systems/schemas';
import {
  buildVocabulary,
  validateClaimGrounding,
  validateViewGrounding,
} from '@recipe-systems/llm-adapter';

const REPO = path.join(__dirname, '..', '..');
const golden = JSON.parse(
  fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'golden_kanyakumari_card.json'), 'utf8'),
);

function lineId(index: number): string {
  return `golden_line_${index + 1}`;
}

const captured: StructuredRecipeInput = {
  structured_recipe: {
    ingredients: golden.card.lines.map((text: string, i: number) => {
      const [namePart, amountPart] = text.split('—').map((p: string) => p.trim());
      return {
        id: lineId(i),
        display_name: text,
        canonical_name: null,
        amount_text: amountPart ?? null,
        quantity: null,
        unit: null,
        confirmed_sense: namePart.toLowerCase().includes('powder') ? 'powder' : null,
        category: null,
        food_id: null,
        include_on_list: true,
      };
    }),
    method_steps: [],
    method_source: { name: 'CDK 1669 / Mrs. Anitha', type: 'video', matched: true },
    explicitly_absent: golden.expected.absent,
    card_metadata: { photographed: true, legible_issues: [] },
  },
};

const FISH_ID = lineId(0); // "Fish — 500g"
const FENUGREEK_POWDER = golden.card.lines.findIndex((l: string) => l.startsWith('Fenugreek Powder'));
const FENUGREEK_SEED = golden.card.lines.findIndex((l: string) => l.startsWith('Fenugreek —'));

describe('D-16 grounding — golden fixture integration (DISPATCH done criterion 1)', () => {
  it('the captured vocabulary resolves every golden card line', () => {
    const vocab = buildVocabulary(captured);
    expect(vocab.ingredientIds.size).toBe(golden.card.lines.length);
    for (const line of golden.card.lines) {
      const tokens = [...vocab.allNameTokens];
      expect(tokens.some((t) => line.toLowerCase().includes(t))).toBe(true);
    }
  });

  it('hand-checked golden claims all resolve or are ABSENT (green)', () => {
    const claims: Claim[] = [
      {
        claim_text: 'Fish is the protein, poached in the sour gravy.',
        claim_tag: 'CARD',
        source_reference: FISH_ID,
        allergen_id: null,
      },
      {
        claim_text: 'Fenugreek powder gives the bitter-aroma base.',
        claim_tag: 'CARD',
        source_reference: lineId(FENUGREEK_POWDER),
        allergen_id: null,
      },
      {
        claim_text: 'Fenugreek seeds pop last in the tadka.',
        claim_tag: 'CARD',
        source_reference: lineId(FENUGREEK_SEED),
        allergen_id: null,
      },
      {
        claim_text: 'Garlic is absent from this card.',
        claim_tag: 'ABSENT',
        source_reference: null,
        allergen_id: null,
      },
      {
        claim_text: 'Ginger is absent from this card.',
        claim_tag: 'ABSENT',
        source_reference: null,
        allergen_id: null,
      },
    ];
    for (const claim of claims) {
      expect(validateClaimGrounding(claim, captured).ok).toBe(true);
    }
  });

  it('the two fenugreek lines stay structurally distinct in the capture (golden invariant)', () => {
    const vocab = buildVocabulary(captured);
    const powderTokens = vocab.nameTokensByLine.get(lineId(FENUGREEK_POWDER))!;
    const seedTokens = vocab.nameTokensByLine.get(lineId(FENUGREEK_SEED))!;
    expect(powderTokens).toContain('powder');
    expect(powderTokens).not.toBe(seedTokens);
    expect(lineId(FENUGREEK_POWDER)).not.toBe(lineId(FENUGREEK_SEED));
  });

  it('plant: garlic as a POSITIVE claim against the golden capture is caught', () => {
    const planted: Claim = {
      claim_text: 'Garlic deepens the base of the gravy.',
      claim_tag: 'CARD',
      source_reference: FISH_ID,
      allergen_id: null,
    };
    const verdict = validateClaimGrounding(planted, captured);
    expect(verdict.ok).toBe(false);
  });

  it('plant: ginger smuggled into a view payload is caught via the absent channel', () => {
    const plantedView8 = {
      present: ['Fish'],
      not_on_card: [],
      unknown: [],
      removal_notes: [],
      disclaimer: 'Ingredient screen, not a safety certificate.',
      allergen_line: { contains: ['Fish', 'Ginger'], notes: [], unknown: [] },
    };
    const verdict = validateViewGrounding(8, plantedView8 as never, captured);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.violations.some((v) => v.code === 'ABSENT_ITEM_USED_WITHOUT_ABSENT_TAG')).toBe(true);
    }
  });

  it('plant: an invented non-captured ingredient id in View 1 is caught', () => {
    const plantedView1 = {
      items: [
        {
          ingredient_id: 'garlic_5cloves',
          job: 'Aromatic base',
          if_omitted: 'Flatter sauce',
          tag: 'CARD',
        },
      ],
      role_groups: [],
    };
    const verdict = validateViewGrounding(1, plantedView1 as never, captured);
    expect(verdict.ok).toBe(false);
  });
});
