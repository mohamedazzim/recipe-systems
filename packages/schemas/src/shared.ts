import { z } from 'zod';

// ---------------------------------------------------------------------------
// Claim tags \u2014 the SIX canonical provenance tags (Analysis Prompts \u00a71 "TAGGING";
// ERD \u00a7analysis_claim.claim_tag). Single source of truth \u2014 every view item tag,
// the claim schema, and the envelope claim_tags map all resolve to this enum.
// ---------------------------------------------------------------------------
export const CLAIM_TAGS = ['CARD', 'METHOD', 'INFERRED', 'ABSENT', 'UNKNOWN', 'ASSUMED'] as const;
export const ClaimTagSchema = z.enum(CLAIM_TAGS);
export type ClaimTag = z.infer<typeof ClaimTagSchema>;

// Per-view item-tag subsets are canonical (each view's prompt fixes its own set):
export const ClaimTagCardMethodInferredAssumedSchema = z.enum(['CARD', 'METHOD', 'INFERRED', 'ASSUMED']);
export const ClaimTagCardMethodInferredSchema = z.enum(['CARD', 'METHOD', 'INFERRED']);

// ---------------------------------------------------------------------------
// analysis_claim rows (ERD \u00a7analysis_claim): claim_text, claim_tag, source_reference,
// allergen_id (nullable FK \u2192 allergen_map).
// ---------------------------------------------------------------------------
export const ClaimSchema = z
  .object({
    claim_text: z.string().min(1),
    claim_tag: ClaimTagSchema,
    source_reference: z.string().nullable(),
    allergen_id: z.string().uuid().nullable(),
  })
  .strict();
export type Claim = z.infer<typeof ClaimSchema>;

// ---------------------------------------------------------------------------
// Label packs (user profile / label_pack; Deterministic Views \u00a71 region_pack)
// ---------------------------------------------------------------------------
export const LabelPackSchema = z.enum(['US', 'EU']);
export type LabelPack = z.infer<typeof LabelPackSchema>;

// ---------------------------------------------------------------------------
// Analysis mode + per-view status
// ---------------------------------------------------------------------------
export const AnalysisModeSchema = z.enum(['home', 'chef']);
export type AnalysisMode = z.infer<typeof AnalysisModeSchema>;

export const ViewStatusSchema = z.enum(['COMPLETE', 'INCOMPLETE']);
export type ViewStatus = z.infer<typeof ViewStatusSchema>;

// Confidence — single instance shared by Identification (API §4) and View 5
// (Analysis Prompts §6). One source of truth for the three canonical values.
export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

// ---------------------------------------------------------------------------
// Shared LLM input (Analysis Prompts \u00a70 "Input schema (inject before every call)")
// \u2014 the structured_recipe object. Matches recipe_lines.
// ---------------------------------------------------------------------------
export const StructuredRecipeInputSchema = z
  .object({
    structured_recipe: z
      .object({
        ingredients: z.array(
          z
            .object({
              id: z.string().min(1), // recipe_lines.line_id
              display_name: z.string().min(1), // as written by the user
              canonical_name: z.string().nullable(), // alias-resolved canonical name
              amount_text: z.string().nullable(), // display string ("2 Tsp", "To Taste", ...)
              quantity: z.number().nullable(), // parsed numeric amount (null for "to taste")
              unit: z.string().nullable(), // tsp, tbsp, g, kg, nos, ...
              confirmed_sense: z.string().nullable(), // "powder" vs "seeds" distinction
              category: z.string().nullable(), // fresh_produce | fish_meat | spices | fats_oils | other
              food_id: z.string().nullable(), // FK \u2192 food_composition_table (for V9)
              include_on_list: z.boolean(),
            })
            .strict(),
        ),
        method_steps: z.array(
          z
            .object({
              id: z.string().min(1),
              text: z.string().min(1),
              source: z.enum(['CARD', 'METHOD']).nullable(),
            })
            .strict(),
        ),
        method_source: z
          .object({
            name: z.string().nullable(),
            type: z.enum(['video', 'text']).nullable(),
            matched: z.boolean(),
          })
          .strict(),
        explicitly_absent: z.array(z.string()),
        card_metadata: z
          .object({
            photographed: z.boolean(),
            legible_issues: z.array(z.string()),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
export type StructuredRecipeInput = z.infer<typeof StructuredRecipeInputSchema>;

// ---------------------------------------------------------------------------
// Deterministic views input (Deterministic Views \u00a71 "Inputs (shared)")
// ---------------------------------------------------------------------------
export const DeterministicViewInputSchema = z
  .object({
    ingredients: z.array(
      z
        .object({
          id: z.string().min(1),
          canonical_name: z.string().nullable(), // alias-resolved canonical ingredient
          food_id: z.string().nullable(), // FK \u2192 food_composition_table
          quantity: z.number().nullable(),
          amount_text: z.string().nullable(),
          category: z.string().nullable(),
        })
        .strict(),
    ),
    explicitly_absent: z.array(z.string()), // noted at parse review (e.g. "garlic")
    region_pack: LabelPackSchema, // from user profile / label_pack
  })
  .strict();
export type DeterministicViewInput = z.infer<typeof DeterministicViewInputSchema>;

// ---------------------------------------------------------------------------
// View 9 user-editable assumptions (Deterministic Views \u00a73 "Inputs beyond the object")
// ---------------------------------------------------------------------------
export const View9AssumptionsSchema = z
  .object({
    fish_class: z.enum(['lean', 'oily']),
    coconut_grams: z.number(),
    oil_tbsp: z.number(),
    portions: z.number().nullable(),
  })
  .strict();
export type View9Assumptions = z.infer<typeof View9AssumptionsSchema>;
