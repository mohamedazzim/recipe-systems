// Q9 (2026-09-11): DESIGNATED live-verification harness — the ONLY place real
// DeepSeek calls happen. NEVER auto-run; CI never runs it; unit tests never
// call the network. Requires the server-side environment:
//   LLM_PROVIDER=deepseek
//   DEEPSEEK_API_KEY  (never printed, never logged, never committed)
//   DEEPSEEK_MODEL / DEEPSEEK_BASE_URL (verified at preflight: /models lists
//   deepseek-flash + deepseek-v4-pro).
//
// What it proves: DeepSeek response → JSON extraction → frozen D-05 schema →
// D-16 grounding → publish decision, for Views 1–7 against a controlled golden
// capture. Views 8/9 are deterministic and are deliberately NOT called.
//
// Usage: set the env from the local .env, then `node scripts/verify-deepseek.js`.

const { DeepSeekLlmAdapter, generateGrounded, LlmPermanentProviderError } = require('../packages/llm-adapter/dist/index.js');

const GOLDEN_CAPTURE = {
  structured_recipe: {
    ingredients: [
      ['line-1', 'Fish — 500g', '500g'],
      ['line-2', 'Drumstick — 1 Nos', '1 Nos'],
      ['line-3', 'Mango — 1/2 Nos', '1/2 Nos'],
      ['line-4', 'Grated Coconut — Half Shell', 'Half Shell'],
      ['line-5', 'Coconut Oil — For Tempering', 'For Tempering'],
      ['line-6', 'Chilli — 5 Nos', '5 Nos'],
      ['line-7', 'Chilli Powder — 2 Tsp', '2 Tsp'],
      ['line-8', 'Coriander Powder — 1 Tsp', '1 Tsp'],
      ['line-9', 'Tamarind — A Lemon Size', 'A Lemon Size'],
      ['line-10', 'Fenugreek Powder — 1/2 Tsp', '1/2 Tsp'],
      ['line-11', 'Fenugreek — 1/4 Tsp', '1/4 Tsp'],
    ].map(([id, display_name, amount_text]) => ({
      id,
      display_name,
      canonical_name: null,
      amount_text,
      quantity: null,
      unit: null,
      confirmed_sense: null,
      category: null,
      food_id: null,
      include_on_list: true,
    })),
    method_steps: [
      {
        id: 'method-1',
        text: 'Soak tamarind and extract the juice. Temper mustard and fenugreek in coconut oil. Add fish, chilli and drumstick. Simmer until cooked. Finish with coriander.',
        source: 'METHOD',
      },
    ],
    method_source: { name: 'CDK 1669 / Mrs. Anitha', type: 'INFERRED', matched: false },
    explicitly_absent: ['garlic', 'ginger'],
    card_metadata: { photographed: false, legible_issues: [] },
  },
};

async function main() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('verify-deepseek: DEEPSEEK_API_KEY is not set in the environment');
    process.exitCode = 2;
    return;
  }
  const only = process.env.VERIFY_VIEWS
    ? process.env.VERIFY_VIEWS.split(',').map((v) => Number(v.trim()))
    : [1, 2, 3, 4, 5, 6, 7];
  const adapter = new DeepSeekLlmAdapter();
  console.log(`provider: ${adapter.describe()}`); // model + base URL only — never secrets
  console.log('view | latency_ms | parse | grounding | publish decision');
  let published = 0;
  for (const view of only) {
    const started = Date.now();
    let result;
    try {
      result = await generateGrounded(
        adapter,
        {
          view: view,
          mode: 'home',
          recipe_snapshot: GOLDEN_CAPTURE,
          prompt_version: 'v2',
          model_version: adapter.modelVersion,
        },
        GOLDEN_CAPTURE,
      );
    } catch (err) {
      if (err instanceof LlmPermanentProviderError) {
        console.log(`${view} | ${Date.now() - started} | PERMANENT-ERROR | - | NO-RETRY (${err.message})`);
        continue;
      }
      console.log(`${view} | ${Date.now() - started} | TRANSIENT-ERROR | - | retry-eligible (${err.message})`);
      continue;
    }
    const parse = result.parse.ok ? 'ok' : `invalid: ${result.parse.errors.slice(0, 2).join('; ')}`;
    const grounding = result.grounding
      ? result.grounding.ok
        ? 'ok'
        : `violations(${result.grounding.violations.length})`
      : 'n/a';
    const decision = result.parse.ok && result.grounding && result.grounding.ok ? 'COMPLETE' : 'REJECTED';
    if (decision === 'COMPLETE') published += 1;
    console.log(`${view} | ${Date.now() - started} | ${parse} | ${grounding} | ${decision}`);
    if (result.grounding && !result.grounding.ok) {
      for (const v of result.grounding.violations.slice(0, 3)) {
        console.log(`    violation: ${v.message ?? JSON.stringify(v)}`);
      }
    }
  }
  console.log(`publish decision: ${published}/${only.length} views accepted (rejected/error views must never be published)`);
}

main().catch((err) => {
  console.error('verify-deepseek: unexpected failure', err && err.message);
  process.exitCode = 1;
});
