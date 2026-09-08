import { z } from 'zod';

// View 9 \u2014 Calories & micronutrients (Deterministic Views \u00a73).
// Band, never a point. Sodium is "unknown" \u2014 never a fabricated number.
const MinMaxSchema = z
  .object({
    min: z.number(),
    max: z.number(),
  })
  .strict();

export const View9PayloadSchema = z
  .object({
    band: z
      .object({
        energy_kcal_min: z.number(),
        energy_kcal_max: z.number(),
        protein_g: MinMaxSchema,
        fat_g: MinMaxSchema,
        carb_g: MinMaxSchema,
        fibre_g: MinMaxSchema,
      })
      .strict(),
    sodium: z.literal('unknown'),
    assumptions: z.array(
      z
        .object({
          key: z.string().min(1),
          value: z.union([z.string(), z.number()]),
          tag: z.literal('ASSUMED'),
        })
        .strict(),
    ),
    per_portion: z
      .object({
        portions: z.number(),
        energy_kcal_min: z.number(),
        energy_kcal_max: z.number(),
      })
      .strict()
      .nullable(),
    tightening_factors: z.array(z.string()),
    disclaimer: z.string().min(1),
  })
  .strict();
export type View9Payload = z.infer<typeof View9PayloadSchema>;
