import { z } from 'zod';
import { ClaimTagCardMethodInferredSchema } from '../shared';

// View 2 \u2014 Taste Pillars (Analysis Prompts \u00a73). Bridge-spice disagreement with
// View 1 is recorded in blind_spot_notes \u2014 never "fixed" by inflating scores.
export const View2PayloadSchema = z
  .object({
    pillars: z.array(
      z
        .object({
          pillar: z.string().min(1),
          source_ingredient_ids: z.array(z.string()),
          if_missing: z.string().min(1),
          tag: ClaimTagCardMethodInferredSchema,
        })
        .strict(),
    ),
    blind_spot_notes: z.array(
      z
        .object({
          ingredient_id: z.string().min(1),
          note: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();
export type View2Payload = z.infer<typeof View2PayloadSchema>;
