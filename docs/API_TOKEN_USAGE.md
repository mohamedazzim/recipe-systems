# API token usage — measured breakdown

What every LLM call in the product costs in **input tokens**, measured against the
live `countTokens` endpoint of the configured provider.

- **Model:** `gemini-3.8-flash` (the value of `GEMINI_MODEL` at measurement time)
- **Method:** `countTokens` called with the **real prompt strings produced by the
  repo's own builders** (`buildViewPrompt`, `buildServingsUserPrompt`,
  `buildVideoProposalUserPrompt`, `buildVideoChaptersUserPrompt`,
  `GEMINI_OCR_PROMPT`) — not hand-written approximations.
- **Sample recipe:** the golden Kanyakumari card shape — 15 ingredient lines, one
  METHOD step, a named method source. Counts scale with recipe size; treat these as
  the cost of a *typical* card.
- **Scope:** input tokens only. Output tokens are not included (see
  *Not measured* at the end).

> **Revision note.** The first pass of this document measured the product as it
> shipped. The figures below are the **fine-tuned** state: absent fields are now
> pruned from the recipe snapshot before it enters the prompt (see
> *Reduction log*). Both states are shown so the delta is auditable.

---

## 1. Per call site

| # | Call site | Where it runs | Tokens (input) | Calls per analysis |
|---|---|---|---|---|
| 1 | Photo OCR — prompt + one real card image | API, on upload (inline) | **1,470** | 1 (photo path only) |
| 2 | Servings estimate | API, background (non-blocking) | **339** | 1, when the source states no yield |
| 3 | Video proposal (find the video) | API, background | **236** | 0–1 (chef mode only) |
| 4 | Video chapters — text frame only | API, background | **247** | 0–1 (chef mode only) |
| 5 | Views 1–7 | Worker, per view | see §2 | 7 |
| 6 | Views 8 and 9 | Worker, deterministic | **0** | — (no provider call) |
| 7 | Grounding / validation | Worker, local code | **0** | — (no provider call) |

Row 1 was measured with a **real 886 KB card photo** from the repo's fixtures, so the
image's tokenization is included, not estimated. Row 4 excludes the video itself —
that is the one cost that depends on video length, covered in *Not measured*.

---

## 2. Views 1–7, per view (home mode)

Each view sends its own system prompt plus the shared recipe snapshot. "Before" is
the original serialisation; "After" is the current tree.

| View | Before | After | Saved |
|---|---|---|---|
| 1 — Ingredient function | 1,900 | 1,602 | 298 |
| 2 — Taste pillars | 1,934 | 1,636 | 298 |
| 3 — Process and timing | 1,883 | 1,585 | 298 |
| 4 — Structure | 1,786 | 1,488 | 298 |
| 5 — Regional context | 1,928 | 1,630 | 298 |
| 6 — Ratio / architecture | 1,899 | 1,601 | 298 |
| 7 — Sensory and time | 1,822 | 1,524 | 298 |
| **Total, one full pass** | **13,152** | **11,066** | **2,086 (−15.9%)** |

The saving is a flat 298 tokens per view because the same 298 tokens of empty fields
were being repeated in every call.

Chef mode is **not re-measured**. Its snapshot is byte-identical to home mode's, so the
same −298/view applies: ≈13,898 → ≈11,812 (extrapolated, not measured).

Reference points:

| Item | Before | After |
|---|---|---|
| Captured recipe snapshot (carried by all 7 view prompts) | 1,042 | **744** (−29%) |
| Snapshot × 7 views | 7,294 | 5,208 |
| Shared prefix (system prompt + snapshot) as a share of a view prompt | 85.4% | 82.5% |

---

## 3. What one full analysis costs

**Photo intake, home mode, nine views, nothing regenerated:**

| Stage | Before | After |
|---|---|---|
| OCR (prompt + image) | 1,470 | 1,470 |
| Servings estimate | 339 | 339 |
| Views 1–7 | 13,152 | **11,066** |
| Views 8 + 9 | 0 | 0 |
| **Total** | **14,961** | **12,875 (−13.9%)** |

| Scenario | Before | After |
|---|---|---|
| Text or form intake (no OCR) | 13,491 | 11,405 |
| Chef mode | 15,707 | ≈13,625 (extrapolated) |
| Re-analysis of an unchanged recipe | 14,961 | 12,875 — the full pass still repeats; nothing is reused today |
| Worst case: one regeneration per view, job retried once | ≈57,000 | ≈49,000 |

---

## 4. Reduction log

Changes applied to cut prompt cost, each measured on the endpoint above.

| Change | Where | Measured effect |
|---|---|---|
| **Prune absent fields from the snapshot** — drop `null`, `undefined`, empty arrays and whitespace-only strings before serialising. Booleans are kept, because `false` is information. | `packages/llm-adapter/src/snapshot.ts`, used by both `gemini-adapter` and `deepseek-adapter` | snapshot 1,042 → 744; views −2,086; **full analysis −13.9%** |

Why pruning is safe: it is information-preserving **by construction** — a field with no
value is one the model could not have used — and the measurement confirms it
(**0 fields carrying a value were lost**). It also cannot weaken grounding, because
grounding validation runs server-side against the real capture object, never against
this pruned prompt copy.

---

## 5. Remaining levers (measured ceilings, not applied)

The pruning above was the *safe* slice. Much more is available — but the remaining
wins need fewer calls, not smaller text.

| Lever | Measured ceiling | Why it is not applied |
|---|---|---|
| **Send the shared prefix once.** The system prompt (562 tokens) + snapshot are identical across all 7 views. One call covering the views, or provider-side prompt caching of that prefix. | 13,152 → **≈3.4k** input (**−74%**). Caching alone bills ~64% less of the same tokens. | Architectural: batching loses per-view failure isolation, and the frozen per-view schema gates would have to validate one combined response. Caching depends on the model's minimum cacheable prefix (1,604 tokens may sit under some thresholds) and pays cache storage. |
| **Columnar snapshot** — one header row plus one line per ingredient, no repeated keys. | snapshot 744 → **363** (a further **−51%** of the snapshot, ≈ −9% of the full analysis) | Changes the *shape* the model reads. CI runs the deterministic stub, so a grounding regression from a format change would not be caught by the suite — this needs a deliberate A/B on a real card. |
| **Selective re-analysis** — re-run only the views an ingredient edit can affect (View 6 is amount-based; View 9 is deterministic; View 2 partially; View 7 partially). | re-analysis **−70–85%** | Blocked on persisting the captured snapshot with the analysis (Q1 in the register). |
| **Cap thinking / output** — forward `GEMINI_THINKING_LEVEL` (currently ignored on the API path). | Output-side; unmeasured here | Thinking tokens are billed as output and are not in any figure on this page. |
| **Per-view field projection** — each view receives only the capture fields it can use. | Unmeasured | Composes with the columnar change; same grounding-verification problem. |

The single highest-value next step is the shared-prefix change: 85% of the view spend
is the same text sent seven times.

---

## 6. Not measured

These are deliberately excluded rather than guessed. Where a documented rate exists it
is given as a *documented rate*, not as a measurement.

| Item | Status |
|---|---|
| **Video chapters — the video payload itself** | Not measured: needs a real video attached. At Gemini's documented default sampling rate (~263 tokens per second of video) a 5-minute video alone would be ≈79,000 tokens and a 10-minute video ≈158,000 — an order of magnitude more than the entire rest of the analysis. This is the cost driver in chef mode, and it is why generation runs in the background rather than on the request path. |
| **Output tokens** | Not measured. Every call returns a small JSON object; `countTokens` reports input only. |
| **Grounding / validation** | Genuinely zero provider tokens — it runs in-process against the captured recipe. |
| **Retry amplification** | The adapters retry (Gemini `GEMINI_MAX_RETRIES`), and pg-boss retries a failed job up to 3 times. Worst case multiplies whichever calls fail. |
| **Chef-mode figures marked "extrapolated"** | Derived from the home-mode measurement plus the identical snapshot delta, not separately measured. |

---

## 7. Reproducing this

Two scripts drive the numbers on this page, both building the real prompts from the
compiled packages:

```bash
npm run build -w @recipe-systems/database -w @recipe-systems/schemas \
              -w @recipe-systems/llm-adapter -w @recipe-systems/ocr-adapter
node token-budget.js     # per call site, per view, one full analysis
node prove-pruned.js     # before/after for the pruning change
```

Both read `GEMINI_API_KEY` and `GEMINI_MODEL` from the repo `.env` and call
`countTokens` once per row, so a re-run costs a handful of tokens and no generation.

Re-measure whenever a prompt version changes (`PROMPT_VERSION`,
`SERVINGS_PROMPT_VERSION`, `VIDEO_PROMPT_VERSION`) — the figures above are pinned to
the versions in the tree at measurement time, not to the product forever.
