import { z } from 'zod';

// View 4 \u2014 Substitutions (Analysis Prompts \u00a75). At most one substitute per
// existing ingredient; every substitution is an inference.
export const View4PayloadSchema = z
  .object({
    substitutions: z.array(
      z
        .object({
          ingredient_id: z.string().min(1),
          substitute: z.string().min(1),
          consequence: z.string().min(1),
          tag: z.literal('INFERRED'),
        })
        .strict(),
    ),
  })
  .strict();
export type View4Payload = z.infer<typeof View4PayloadSchema>;
