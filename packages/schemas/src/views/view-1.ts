import { z } from 'zod';
import { ClaimTagCardMethodInferredAssumedSchema } from '../shared';

// View 1 \u2014 Ingredient Function (Analysis Prompts \u00a72). Every ingredient gets its
// functional role + omission consequence; then role clusters group them.
export const View1PayloadSchema = z
  .object({
    items: z.array(
      z
        .object({
          ingredient_id: z.string().min(1),
          job: z.string().min(1),
          if_omitted: z.string().min(1),
          tag: ClaimTagCardMethodInferredAssumedSchema,
        })
        .strict(),
    ),
    role_groups: z.array(
      z
        .object({
          role: z.string().min(1),
          ingredient_ids: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();
export type View1Payload = z.infer<typeof View1PayloadSchema>;
