// D-17 (P3-3): Q9-honest adapter resolution. NO provider is selected here —
// the worker stays provider-neutral through the D-15 seam (Tech Stack §10).
// - ANALYSIS_LLM_STUB=1 → a deterministic dev/demo stub that builds its view
//   payloads FROM THE CAPTURED INGREDIENT IDS in the request (so the D-16
//   grounding gate validates them against the same captured state — the full
//   pipeline, including rejection, stays exercised; labeled, never production).
// - default → ProviderPendingError: jobs fail cleanly as `failed` (never stuck
//   at `generating`) until Q9 lands a real provider adapter.

import { LlmAdapter, LlmGenerateRequest } from '@recipe-systems/llm-adapter';
import type { StructuredRecipeInput } from '@recipe-systems/schemas';

export class ProviderPendingError extends Error {
  constructor() {
    super('no LLM provider configured — Q9 OPEN (benchmark wks 1–4; adapter stub only)');
    this.name = 'ProviderPendingError';
  }
}

class PendingAdapter implements LlmAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generate(_request: LlmGenerateRequest): Promise<unknown> {
    throw new ProviderPendingError();
  }
}

/** Dev/demo only: deterministic outputs built from the captured state, so the
 *  D-16 grounding choke point still decides COMPLETE vs INCOMPLETE for every
 *  view. Never production — Q9 stays OPEN. */
class StubAdapter implements LlmAdapter {
  async generate(request: LlmGenerateRequest): Promise<unknown> {
    const snapshot = request.recipe_snapshot as StructuredRecipeInput;
    const ids = snapshot.structured_recipe.ingredients.map((i) => i.id);
    const names = snapshot.structured_recipe.ingredients.map((i) => i.display_name);
    const first = ids[0];
    const second = ids[1] ?? ids[0];

    switch (request.view) {
      case 1:
        return {
          items: ids.map((id, i) => ({
            ingredient_id: id,
            job: names[i] ? `${names[i]} carries its own job in the dish` : 'Contributes to the dish',
            if_omitted: 'The dish changes noticeably',
            tag: 'CARD' as const,
          })),
          role_groups: ids.length > 0 ? [{ role: 'Together', ingredient_ids: ids }] : [],
        };
      case 2:
        return {
          pillars:
            ids.length > 0
              ? [
                  {
                    pillar: 'Body',
                    source_ingredient_ids: ids.slice(0, Math.min(2, ids.length)),
                    if_missing: 'Thinner, less complete result',
                    tag: 'CARD' as const,
                  },
                ]
              : [],
          blind_spot_notes: [],
        };
      case 3:
        return {
          status: 'COMPLETE',
          stages: [
            {
              stage_name: 'Build the dish',
              action: `Prepare ${names[0] ?? 'the ingredients'}; follow the recorded method to the end.`,
              cue: 'Done when the method cue is met',
              duration: 'UNKNOWN',
              tag: 'METHOD' as const,
            },
          ],
          incomplete_reason: null,
        };
      case 4:
        return {
          substitutions:
            first !== undefined
              ? [
                  {
                    ingredient_id: first,
                    substitute: 'A close equivalent',
                    consequence: 'Small flavour shift; the structure holds',
                    tag: 'INFERRED' as const,
                  },
                ]
              : [],
        };
      case 5:
        return {
          family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
          architecture: 'Raw-ground coconut paste, triple sour, late fenugreek+pepper',
          confidence: 'high',
          not_this: [
            { variant: 'Kerala meen curry', key_difference: 'Kudampuli instead of tamarind/mango' },
          ],
          needs_review: true,
          tag: 'INFERRED',
        };
      case 6:
        return {
          ratios: [
            { components: 'chilli powder : coriander', ratio: '2 tsp : 1 tsp', structural: true, tag: 'CARD' },
          ],
          unresolvable: [{ components: 'salt : liquid', reason: 'salt quantity is null', tag: 'UNKNOWN' }],
        };
      case 7:
        return {
          status: 'COMPLETE',
          memorable_elements: [
            {
              element: second !== first && second !== undefined ? 'The second ingredient returns in the finish' : 'The finish repeats the main ingredient',
              grounded_in: 'Process stage finish aroma, per View 3',
              tag: 'INFERRED',
            },
          ],
        };
      default:
        throw new Error(`stub adapter has no fixture for view ${String(request.view)}`);
    }
  }
}

export function resolveAdapter(env: Record<string, string | undefined>): LlmAdapter {
  if (env.ANALYSIS_LLM_STUB === '1') {
    return new StubAdapter();
  }
  return new PendingAdapter();
}
