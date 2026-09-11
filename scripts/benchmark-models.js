// Q9 MODEL BENCHMARK (2026-09-11): deepseek-v4-pro vs deepseek-flash vs
// flash+thinking-effort. DESIGNATED live harness — NEVER auto-run; CI never
// runs it; unit tests never call the network.
//
// Controls (identical across configurations — no validation weakened):
//   - the SAME golden capture used by the Q9 verify harness (two absent
//     plants: garlic + ginger; onion never appears),
//   - D-15 prompt pair (prompt_version v2) + system prompts via the real
//     DeepSeekLlmAdapter,
//   - temperature 0, stream false, mode home,
//   - generateGrounded = frozen D-05 schema gate + D-16 grounding validator,
//   - regenerate-once on grounding violation (exact worker semantics),
//   - concurrency 4 (same lane-claim order as the worker handler).
//
// Views 8/9 are deterministic and are NOT called.
//
// Usage: load the server-side env from the local .env, then
//   node scripts/benchmark-models.js
// Optional: BENCH_PASSES (default 2), BENCH_OUT (JSON result path).

const {
  DeepSeekLlmAdapter,
  generateGrounded,
  LlmPermanentProviderError,
} = require('../packages/llm-adapter/dist/index.js');

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
        text:
          'Soak tamarind and extract the juice. Temper mustard and fenugreek in ' +
          'coconut oil. Add fish, chilli and drumstick. Simmer until cooked. ' +
          'Finish with coriander.',
        source: 'METHOD',
      },
    ],
    method_source: { name: 'CDK 1669 / Mrs. Anitha', type: 'INFERRED', matched: false },
    explicitly_absent: ['garlic', 'ginger'],
    card_metadata: { photographed: false, legible_issues: [] },
  },
};

const VIEWS = [1, 2, 3, 4, 5, 6, 7];

const CONFIGS = [
  { key: 'pro', model: 'deepseek-v4-pro', thinking: undefined, effort: undefined },
  { key: 'flash', model: 'deepseek-flash', thinking: undefined, effort: undefined },
  { key: 'flash-low', model: 'deepseek-flash', thinking: { type: 'enabled' }, effort: 'low' },
  { key: 'flash-high', model: 'deepseek-flash', thinking: { type: 'enabled' }, effort: 'high' },
];

const PASSES = Math.max(1, Number(process.env.BENCH_PASSES ?? 2));
const CONCURRENCY = 4;

function fmt(ms) {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return '-';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

async function runOnePass(adapter, usageSink) {
  const viewRecords = new Map(); // view -> record
  let next = 0;
  const lanes = Array.from({ length: CONCURRENCY }, async () => {
    while (next < VIEWS.length) {
      const view = VIEWS[next];
      next += 1;
      const rec = {
        view,
        attempts: [],
        outcome: 'pending',
        regenerate: 0,
        schemaFailures: 0,
        groundingViolations: 0,
      };
      viewRecords.set(view, rec);
      try {
        const request = {
          view,
          mode: 'home',
          recipe_snapshot: GOLDEN_CAPTURE,
          prompt_version: 'v2',
          model_version: adapter.modelVersion,
        };
        const started = Date.now();
        const first = await generateGrounded(adapter, request, GOLDEN_CAPTURE);
        rec.attempts.push({ ms: Date.now() - started, usage: usageSink.shiftFor(view) });
        if (!first.parse.ok) {
          rec.schemaFailures += 1;
          rec.outcome = 'SCHEMA-FAIL';
          console.log(
            `  [${adapter.describe()}] view ${view}: SCHEMA-FAIL (${first.parse.errors.slice(0, 2).join('; ')})`,
          );
          continue;
        }
        if (first.grounding && !first.grounding.ok) {
          rec.groundingViolations += first.grounding.violations.length;
          rec.regenerate = 1;
          const secondStarted = Date.now();
          const second = await generateGrounded(adapter, request, GOLDEN_CAPTURE);
          rec.attempts.push({ ms: Date.now() - secondStarted, usage: usageSink.shiftFor(view) });
          if (!second.parse.ok) {
            rec.schemaFailures += 1;
            rec.outcome = 'SCHEMA-FAIL';
            console.log(`  view ${view}: SCHEMA-FAIL on regenerate (${second.parse.errors.slice(0, 2).join('; ')})`);
            continue;
          }
          if (second.grounding && !second.grounding.ok) {
            rec.groundingViolations += second.grounding.violations.length;
            rec.outcome = 'INCOMPLETE';
            console.log(`  view ${view}: INCOMPLETE (grounding violations persisted after regenerate-once)`);
            continue;
          }
          rec.outcome = 'COMPLETE';
          rec.payload = second.parse.data;
          console.log(`  view ${view}: COMPLETE (regenerated once) total=${fmt(rec.attempts.reduce((a, b) => a + b.ms, 0))}`);
          continue;
        }
        rec.outcome = 'COMPLETE';
        rec.payload = first.parse.data;
        console.log(`  view ${view}: COMPLETE total=${fmt(rec.attempts[0].ms)}`);
      } catch (err) {
        if (err instanceof LlmPermanentProviderError) {
          rec.outcome = 'PROVIDER-PERMANENT';
          console.log(`  view ${view}: PROVIDER-PERMANENT (${err.message})`);
        } else {
          rec.outcome = err && err.message && err.message.includes('timed out') ? 'TIMEOUT' : 'PROVIDER-TRANSIENT';
          console.log(`  view ${view}: ${rec.outcome} (${err && err.message})`);
        }
        rec.attempts.push({ ms: null, usage: null }); // duration unknown (retries exhausted)
      }
    }
  });
  await Promise.all(lanes);
  return viewRecords;
}

async function main() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('benchmark-models: DEEPSEEK_API_KEY is not set in the environment');
    process.exitCode = 2;
    return;
  }
  const results = [];
  console.log(`Q9 MODEL BENCHMARK — ${PASSES} pass(es) per config, concurrency ${CONCURRENCY}`);
  console.log('golden capture: 11 ingredients, 1 method step, explicitly_absent=[garlic, ginger]');
  for (const cfg of CONFIGS) {
    console.log(`\n=== ${cfg.key} (${cfg.model}${cfg.effort ? `, effort=${cfg.effort}` : ', default thinking'}) ===`);
    const configPasses = [];
    for (let p = 1; p <= PASSES; p += 1) {
      const usageSink = (() => {
        const q = [];
        return {
          push: (u) => q.push(u),
          // usage events carry view/mode from the adapter — FIFO per view so a
          // regenerate attempt still matches its own view's record.
          shiftFor: (view) => {
            const i = q.findIndex((u) => u.view === view);
            return i >= 0 ? q.splice(i, 1)[0] : null;
          },
        };
      })();
      const adapter = new DeepSeekLlmAdapter({
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: cfg.model,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
        timeoutMs: process.env.DEEPSEEK_TIMEOUT_MS ? Number(process.env.DEEPSEEK_TIMEOUT_MS) : undefined,
        maxRetries: process.env.DEEPSEEK_MAX_RETRIES ? Number(process.env.DEEPSEEK_MAX_RETRIES) : undefined,
        thinking: cfg.thinking,
        reasoningEffort: cfg.effort,
        onUsage: (u) => usageSink.push(u),
      });
      const passStart = Date.now();
      const records = await runOnePass(adapter, usageSink);
      const wall = Date.now() - passStart;
      const summary = summarize(records, wall);
      configPasses.push(summary);
      console.log(`pass ${p}/${PASSES}: wall=${fmt(wall)} complete=${summary.complete}/7 incomplete=${summary.incomplete} schemaFail=${summary.schemaFailures} groundVio=${summary.groundingViolations} providerFail=${summary.providerFailures} tokens(in=${summary.promptTokens},out=${summary.completionTokens})`);
    }
    const agg = aggregate(cfg.key, configPasses);
    // Keep full per-pass records (payloads included) for semantic analysis.
    results.push({ ...agg, passes: configPasses });
  }
  console.log('\n===== COMPARISON TABLE =====');
  printTable(results);
  const out = process.env.BENCH_OUT;
  if (out) {
    require('fs').writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), configs: results }, null, 2));
    console.log(`\nresults written to ${out}`);
  }
}

function summarize(records, wall) {
  const s = {
    wall,
    complete: 0,
    incomplete: 0,
    schemaFailures: 0,
    groundingViolations: 0,
    providerFailures: 0,
    timeouts: 0,
    regenerates: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    views: {},
  };
  for (const [view, rec] of [...records.entries()].sort((a, b) => a[0] - b[0])) {
    const totalMs = rec.attempts.reduce((a, b) => a + (b && typeof b.ms === 'number' ? b.ms : 0), 0);
    s.views[view] = {
      totalMs,
      attempts: rec.attempts.length,
      outcome: rec.outcome,
      regenerate: rec.regenerate,
      payload: rec.payload ?? null,
    };
    if (rec.outcome === 'COMPLETE') s.complete += 1;
    else if (rec.outcome === 'INCOMPLETE') s.incomplete += 1;
    if (rec.outcome === 'SCHEMA-FAIL') s.schemaFailures += 1;
    if (rec.outcome === 'PROVIDER-PERMANENT' || rec.outcome === 'PROVIDER-TRANSIENT') s.providerFailures += 1;
    if (rec.outcome === 'TIMEOUT') { s.timeouts += 1; s.providerFailures += 1; }
    s.groundingViolations += rec.groundingViolations;
    s.regenerates += rec.regenerate;
    for (const a of rec.attempts) {
      if (!a || !a.usage) continue;
      s.promptTokens += a.usage.promptTokens;
      s.completionTokens += a.usage.completionTokens;
      s.totalTokens += a.usage.totalTokens;
      const d = a.usage.details;
      if (d && typeof d.prompt_cache_hit_tokens === 'number') s.cacheHitTokens += d.prompt_cache_hit_tokens;
      if (d && typeof d.prompt_cache_miss_tokens === 'number') s.cacheMissTokens += d.prompt_cache_miss_tokens;
    }
  }
  return s;
}

function aggregate(key, passes) {
  const n = passes.length;
  const a = { key, passes: n };
  for (const field of ['wall', 'schemaFailures', 'groundingViolations', 'providerFailures', 'timeouts', 'regenerates', 'promptTokens', 'completionTokens', 'totalTokens', 'cacheHitTokens', 'cacheMissTokens']) {
    a[field] = Math.round(passes.reduce((s, p) => s + p[field], 0) / n * 10) / 10;
  }
  a.complete = Math.round(passes.reduce((s, p) => s + p.complete, 0) / n);
  a.incomplete = Math.round(passes.reduce((s, p) => s + p.incomplete, 0) / n);
  for (const view of VIEWS) {
    const values = passes.map((p) => p.views[view] && p.views[view].totalMs).filter((v) => Number.isFinite(v));
    a[`v${view}`] = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
  }
  a.sequentialTheoretical = VIEWS.reduce((s, v) => s + (a[`v${v}`] ?? 0), 0);
  a.slowestView = Math.max(...VIEWS.map((v) => a[`v${v}`] ?? 0));
  return a;
}

function printTable(results) {
  const head = ['metric', ...results.map((r) => r.key)];
  const rows = [
    ['wall (avg of passes)', ...results.map((r) => fmt(r.wall))],
    ['sequential theoretical', ...results.map((r) => fmt(r.sequentialTheoretical))],
    ...VIEWS.map((v) => [`view ${v} latency (avg, incl. attempts)`, ...results.map((r) => fmt(r[`v${v}`]))]),
    ['complete views (avg)', ...results.map((r) => String(r.complete))],
    ['incomplete views (avg)', ...results.map((r) => String(r.incomplete))],
    ['schema failures', ...results.map((r) => String(r.schemaFailures))],
    ['grounding violations', ...results.map((r) => String(r.groundingViolations))],
    ['regenerates', ...results.map((r) => String(r.regenerates))],
    ['provider failures (incl. timeouts)', ...results.map((r) => String(r.providerFailures))],
    ['timeouts', ...results.map((r) => String(r.timeouts))],
    ['prompt tokens (sum)', ...results.map((r) => String(r.promptTokens))],
    ['completion tokens (sum)', ...results.map((r) => String(r.completionTokens))],
    ['cache-hit prompt tokens', ...results.map((r) => String(r.cacheHitTokens))],
    ['cache-miss prompt tokens', ...results.map((r) => String(r.cacheMissTokens))],
  ];
  console.log(head.join(' | '));
  console.log(head.map(() => '---').join(' | '));
  for (const row of rows) console.log(row.join(' | '));
}

main().catch((err) => {
  console.error('benchmark-models: unexpected failure', err && err.message);
  process.exitCode = 1;
});
