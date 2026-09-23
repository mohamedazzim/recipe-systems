// Phase 3 — source-faithful structured recipe extraction contract.
// The model is an EXTRACTOR, never a generator: every field must be traceable
// to the source text; anything absent is null/empty; ambiguity is preserved
// and flagged `needs_review`. A malformed/invalid output is a controlled
// extraction failure (never silently repaired).

import { z } from 'zod';

/** One extracted ingredient. `source` is the verbatim excerpt that produced it. */
export const ExtractedIngredientSchema = z
  .object({
    name: z.string().min(1),
    quantity: z.string().nullable(), // preserved source wording ("2", "1/2", "to taste")
    unit: z.string().nullable(), // tsp/tbsp/g/kg/nos/... when the source states one
    preparation: z.string().nullable(), // e.g. "thinly sliced", "chopped"
    source: z.string().min(1), // the source excerpt (provenance)
    needs_review: z.boolean(), // ambiguous/unparseable — human must confirm
  })
  .strict();
export type ExtractedIngredient = z.infer<typeof ExtractedIngredientSchema>;

/** One extracted method step (explicit instructional text only). */
export const ExtractedMethodStepSchema = z
  .object({
    text: z.string().min(1),
    source: z.string().nullable(),
    needs_review: z.boolean(),
  })
  .strict();
export type ExtractedMethodStep = z.infer<typeof ExtractedMethodStepSchema>;

/** One recipe draft extracted from the document. */
export const RecipeExtractionSchema = z
  .object({
    title: z.string().nullable(), // null when the source has no clear title
    title_needs_review: z.boolean(),
    ingredients: z.array(ExtractedIngredientSchema),
    method_steps: z.array(ExtractedMethodStepSchema),
    needs_review: z.boolean(), // any field flagged → true
    notes: z.array(z.string()), // ambiguity notes (preserved source wording)
    servings: z.number().int().positive().nullable().optional(), // stated serving/yield count, null when absent
  })
  .strict();
export type RecipeExtraction = z.infer<typeof RecipeExtractionSchema>;

/** The full model output for one document: one or more recipe drafts. */
export const DocumentExtractionSchema = z
  .object({
    recipes: z.array(RecipeExtractionSchema).min(1),
  })
  .strict();
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;
