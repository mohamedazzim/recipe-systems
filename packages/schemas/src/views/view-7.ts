import { z } from 'zod';
import { ViewStatusSchema } from '../shared';

// View 7 \u2014 Why It's Memorable (Analysis Prompts \u00a78). Dependency gate: View 3
// INCOMPLETE forces this view INCOMPLETE too \u2014 no technique claims without a process.
export const View7PayloadSchema = z
  .object({
    status: ViewStatusSchema,
    memorable_elements: z.array(
      z
        .object({
          element: z.string().min(1),
          grounded_in: z.string().min(1),
          tag: z.literal('INFERRED'),
        })
        .strict(),
    ),
  })
  .strict();
export type View7Payload = z.infer<typeof View7PayloadSchema>;
