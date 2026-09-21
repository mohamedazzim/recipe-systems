import { parseDocumentExtraction } from './index';

const baseRecipe = {
  title: null as string | null,
  title_needs_review: false,
  ingredients: [] as unknown[],
  method_steps: [] as unknown[],
  needs_review: false,
  notes: [] as string[],
};

describe('parseDocumentExtraction — the no-hallucination validation gate', () => {
  it('accepts a valid extraction', () => {
    const result = parseDocumentExtraction({
      recipes: [
        {
          ...baseRecipe,
          title: 'Chicken Biryani',
          ingredients: [
            {
              name: 'chicken',
              quantity: '500 g',
              unit: 'g',
              preparation: null,
              source: '500 g chicken',
              needs_review: false,
            },
          ],
          method_steps: [
            { text: 'Cook the chicken.', source: 'Cook the chicken.', needs_review: false },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an ingredient missing its source (a field must stay traceable)', () => {
    const result = parseDocumentExtraction({
      recipes: [
        {
          ...baseRecipe,
          ingredients: [{ name: 'chicken' }],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty recipes array (no invented recipe)', () => {
    expect(parseDocumentExtraction({ recipes: [] }).ok).toBe(false);
  });

  it('rejects unknown fields — the schema is .strict() (no invented data)', () => {
    const result = parseDocumentExtraction({
      recipes: [{ ...baseRecipe, invented_field: 'hallucination' }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed root (not an object)', () => {
    expect(parseDocumentExtraction(null).ok).toBe(false);
    expect(parseDocumentExtraction('recipes').ok).toBe(false);
  });
});
