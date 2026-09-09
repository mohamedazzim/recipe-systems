// D-29: strict schemas for reviewed reference-data import files. Imports are
// validated before they are staged; malformed files never reach persistence.

import { z } from 'zod';

export const referenceDataImportSchema = z
  .object({
    import_id: z.string().regex(/^R-\d{4}-\d{2}-\d{2}-\d{3}[a-z]?$/, 'import_id must look like R-YYYY-MM-DD-NNN'),
    title: z.string().min(3),
    sources: z.array(z.string()).min(1),
    sections: z
      .object({
        allergen_definitions: z
          .array(
            z.object({
              code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
              name: z.string().min(1).max(255),
              label_pack: z.enum(['US', 'EU', 'both']).nullable(),
              is_statutory: z.boolean(),
              note: z.string().optional(),
            }),
          )
          .default([]),
        dictionary: z
          .array(
            z.object({
              canonical_name: z.string().min(1).max(255),
              description: z.string().max(1000).nullable().optional(),
            }),
          )
          .default([]),
        aliases: z
          .array(
            z.object({
              ingredient_canonical_name: z.string(),
              alias_text: z.string().min(1).max(255),
              language: z.string().max(32).nullable().optional(),
              requires_confirmation: z.boolean().optional(),
            }),
          )
          .default([]),
        allergen_mappings: z
          .array(
            z.object({
              ingredient_canonical_name: z.string(),
              allergen_code: z.string(),
              effective_from: z.string().datetime(),
              source_reference: z.string().nullable().optional(),
            }),
          )
          .default([]),
        composition_entries: z
          .array(
            z.object({
              ingredient_canonical_name: z.string(),
              external_source: z.string().max(64),
              external_id: z.string().max(128),
              food_name: z.string().max(255),
              is_primary_for_ingredient: z.boolean().default(false),
              versions: z
                .array(
                  z.object({
                    energy_kcal_per_100g: z.string().nullable(),
                    protein_g_per_100g: z.string().nullable(),
                    fat_g_per_100g: z.string().nullable(),
                    carb_g_per_100g: z.string().nullable(),
                    fiber_g_per_100g: z.string().nullable(),
                    sodium_mg_per_100g: z.string().nullable(),
                    source_version: z.string().max(128),
                    effective_from: z.string().datetime(),
                  }),
                )
                .min(1),
            }),
          )
          .default([]),
      })
      .strict(),
  })
  .strict();

export type ReferenceDataImport = z.infer<typeof referenceDataImportSchema>;

/** Human approval record (written by the approve CLI, verified by the service). */
export const approvalRecordSchema = z
  .object({
    import_id: z.string(),
    reviewer: z.string().min(1),
    reviewed_at: z.string().datetime(),
    import_file_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    review_notes: z.string().optional(),
  })
  .strict();

export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;

export type SectionDiffEntry =
  | { action: 'create'; key: string; detail: string }
  | { action: 'skip'; key: string; detail: string }
  | { action: 'supersede'; key: string; detail: string; prior_version: number | null }
  | { action: 'conflict'; key: string; detail: string };

export interface StagedDiff {
  import_id: string;
  title: string;
  reviewed: false;
  file_sha256: string;
  sections: Record<'definitions' | 'dictionary' | 'aliases' | 'mappings' | 'composition', SectionDiffEntry[]>;
}
