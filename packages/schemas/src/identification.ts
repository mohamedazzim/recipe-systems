import { z } from 'zod';
import { ConfidenceSchema } from './shared';

// Canonical identification contract \u2014 API doc \u00a74 POST /recipes/:recipeId/identify
// 200 response (Story RS-US-12), grounded in Recipe_Systems \u00a75 and Epic-C C1 AC-1
// (family, one-line architecture, confidence, not-this neighbours, ABSENT family items).
export const IdentificationSchema = z
  .object({
    family: z.string().min(1),
    architecture: z.string().min(1),
    confidence: ConfidenceSchema,
    not_this: z.array(z.string()),
    absent_on_card: z.array(z.string()),
    tags: z
      .object({
        family: z.literal('INFERRED'),
      })
      .strict(),
  })
  .strict();
export type Identification = z.infer<typeof IdentificationSchema>;
