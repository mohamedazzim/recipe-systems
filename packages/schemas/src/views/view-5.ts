import { z } from 'zod';
import { ConfidenceSchema } from '../shared';

// View 5 \u2014 Regional Context (Analysis Prompts \u00a76). High-risk view: needs_review
// is ALWAYS true (product rule G2), regardless of confidence. Structural-only comparisons.
export const View5PayloadSchema = z
  .object({
    family: z.string().min(1),
    architecture: z.string().min(1),
    confidence: ConfidenceSchema,
    not_this: z.array(
      z
        .object({
          variant: z.string().min(1),
          key_difference: z.string().min(1),
        })
        .strict(),
    ),
    needs_review: z.literal(true),
    tag: z.literal('INFERRED'),
  })
  .strict();
export type View5Payload = z.infer<typeof View5PayloadSchema>;
