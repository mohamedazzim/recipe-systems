// Phase 4 — the user-editable, authoritative recipe draft contract.
// Unlike the Phase 3 extraction contract (which is immutable source evidence),
// this is the shape the user can edit and the PATCH draft endpoint accepts.
// Every row carries a `provenance` marker so the system can tell a
// source-faithful extraction apart from a user correction or a user-added row.

import { z } from 'zod';

export const DRAFT_PROVENANCE = ['source', 'user_corrected', 'user_added'] as const;
export const DraftProvenanceSchema = z.enum(DRAFT_PROVENANCE);
export type DraftProvenance = z.infer<typeof DraftProvenanceSchema>;

export const DRAFT_STATUS = ['draft', 'confirming', 'confirmed'] as const;
export const DraftStatusSchema = z.enum(DRAFT_STATUS);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

/** One editable ingredient. `source` is the retained extraction excerpt — it
 *  MUST be null for a user-added row (no fabricated provenance). */
export const DraftIngredientSchema = z
  .object({
    name: z.string().min(1).max(255),
    quantity: z.string().max(128).nullable(), // free-text amount ("2", "1/2", "to taste")
    unit: z.string().max(64).nullable(),
    preparation: z.string().max(255).nullable(), // "thinly sliced", "chopped"
    provenance: DraftProvenanceSchema,
    source: z.string().max(4000).nullable(), // retained source excerpt (null for user_added)
    needs_review: z.boolean(),
  })
  .strict();
export type DraftIngredient = z.infer<typeof DraftIngredientSchema>;

/** One editable method step. */
export const DraftMethodStepSchema = z
  .object({
    text: z.string().min(1).max(4000),
    provenance: DraftProvenanceSchema,
    source: z.string().max(4000).nullable(),
    needs_review: z.boolean(),
  })
  .strict();
export type DraftMethodStep = z.infer<typeof DraftMethodStepSchema>;

/** The full authoritative draft (the PATCH body, and the persisted user_payload). */
export const DraftEditSchema = z
  .object({
    title: z.string().max(255).nullable(), // null/empty → "Untitled recipe"
    title_needs_review: z.boolean(),
    ingredients: z.array(DraftIngredientSchema).max(200),
    method_steps: z.array(DraftMethodStepSchema).max(200),
  })
  .strict();
export type DraftEdit = z.infer<typeof DraftEditSchema>;
