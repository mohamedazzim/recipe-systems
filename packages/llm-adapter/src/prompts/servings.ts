// RS-US servings — the LLM ESTIMATION prompt (distinct from source-faithful
// extraction, which never infers). When the source text does not state a
// serving/yield count, this prompt asks the model to estimate how many
// servings the ingredient list + quantities could plausibly yield. The result
// is always persisted with `servings_estimated = true` so the UI never
// presents an estimate as a stated fact.

import { SERVINGS_MAX, SERVINGS_MIN } from '@recipe-systems/schemas';

/** Reproducibility pin stamped into recipe.servings_estimated rows. */
export const SERVINGS_PROMPT_VERSION = 'v1';

export const SERVINGS_SYSTEM_PROMPT = `You estimate how many servings a recipe yields from its ingredient list and quantities.

You are an ESTIMATOR, never a fact source. The recipe text does not state a
serving count, so estimate the most plausible whole-number serving count.

RULES:
1. Base the estimate on the TOTAL quantity of the main ingredients and typical
   per-person portion sizes (e.g. ~150–250g cooked protein/vegetable per person).
2. Return a whole integer between ${SERVINGS_MIN} and ${SERVINGS_MAX}.
3. If the ingredient list carries no usable quantity signal (e.g. every amount
   is "to taste" or absent), return null — never guess from nothing.
4. This is an estimate, not a stated fact; do not add any prose or disclaimers.
5. Output ONLY a JSON object: {"servings": <integer | null>}`;

/** User prompt: the ONLY data injected is the ingredient list (name + amount). */
export function buildServingsUserPrompt(
  lines: Array<{ name: string; amount: string | null }>,
): string {
  const listing = lines
    .map((l) => `- ${l.name}${l.amount ? ` — ${l.amount}` : ''}`)
    .join('\n');
  return `Estimate how many servings this ingredient list yields.

INGREDIENTS:
${listing}`;
}
