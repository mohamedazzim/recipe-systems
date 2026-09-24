// BUG-022 regression guard (2026-09-24 external audit, High).
//
// The D-27 regional veto blocks a View 5 sentence by flipping the row to
// INCOMPLETE while deliberately leaving the payload intact — the veto records the
// governance event without silently rewriting the analysis. Readers that parsed
// the payload without consulting `status` therefore kept serving vetoed content,
// so a deliberate safety control was advisory only.
//
// `identificationFamily` is the reader that leaks furthest: it supplies the
// recipe's NAME (and the library's family column).
//
// The prisma double below models a real database faithfully: the vetoed row
// EXISTS with its payload, and it is excluded only when the caller actually asks
// for COMPLETE rows. Drop the status filter from the reader and this suite fails
// — which is the point.
import { RecipeService } from './recipe.service';

const RECIPE_ID = '11111111-1111-4111-8111-111111111111';

const VIEW5_PAYLOAD = {
  family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
  architecture: 'Raw-ground paste, triple sour',
  confidence: 'high',
  not_this: [],
  needs_review: true,
  tag: 'INFERRED',
};

/** A persisted View 5 row in the given status, with its payload always present. */
function prismaWithView5(status: 'COMPLETE' | 'INCOMPLETE') {
  const row = { status, payload: VIEW5_PAYLOAD };
  return {
    analysis: { findFirst: jest.fn(async () => ({ id: 'an-1', family: null })) },
    analysisView: {
      findFirst: jest.fn(async ({ where }: { where: { status?: string } }) =>
        where.status && where.status !== row.status ? null : row,
      ),
    },
  } as never;
}

describe('BUG-022 — a vetoed View 5 must not name the recipe', () => {
  it('returns no family when the reviewer vetoed View 5 (INCOMPLETE, payload kept)', async () => {
    const svc = new RecipeService(prismaWithView5('INCOMPLETE'));

    await expect(svc.identificationFamily(RECIPE_ID)).resolves.toBeNull();
  });

  it('still returns the family when View 5 is COMPLETE (no over-correction)', async () => {
    const svc = new RecipeService(prismaWithView5('COMPLETE'));

    await expect(svc.identificationFamily(RECIPE_ID)).resolves.toBe(VIEW5_PAYLOAD.family);
  });
});
