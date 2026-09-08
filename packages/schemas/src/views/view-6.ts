import { z } from 'zod';

// View 6 \u2014 Ratios (Analysis Prompts \u00a77). Only ratios computable directly from
// stated quantities; anything imprecise goes to unresolvable with tag UNKNOWN.
export const View6PayloadSchema = z
  .object({
    ratios: z.array(
      z
        .object({
          components: z.string().min(1),
          ratio: z.string().min(1),
          structural: z.boolean(),
          tag: z.literal('CARD'),
        })
        .strict(),
    ),
    unresolvable: z.array(
      z
        .object({
          components: z.string().min(1),
          reason: z.string().min(1),
          tag: z.literal('UNKNOWN'),
        })
        .strict(),
    ),
  })
  .strict();
export type View6Payload = z.infer<typeof View6PayloadSchema>;
