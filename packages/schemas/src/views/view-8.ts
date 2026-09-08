import { z } from 'zod';

// View 8 \u2014 Dietary restrictions & allergens (Deterministic Views \u00a72).
// NEVER "safe". Only present / not_on_card / unknown; disclaimer on every output.
export const View8PayloadSchema = z
  .object({
    present: z.array(z.string()),
    not_on_card: z.array(z.string()),
    unknown: z.array(z.string()),
    removal_notes: z.array(
      z
        .object({
          item: z.string().min(1),
          note: z.string().min(1),
        })
        .strict(),
    ),
    disclaimer: z.string().min(1),
    allergen_line: z
      .object({
        contains: z.array(z.string()),
        notes: z.array(z.string()),
        unknown: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
export type View8Payload = z.infer<typeof View8PayloadSchema>;
