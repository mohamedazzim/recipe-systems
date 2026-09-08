import { z } from 'zod';
import { ClaimTagCardMethodInferredSchema, ViewStatusSchema } from '../shared';

// View 3 \u2014 Process & Timing (Analysis Prompts \u00a74). Hard gate: no fabricated
// sequence when method_source.matched=false and no family match \u2192 status INCOMPLETE
// + incomplete_reason populated. duration is a display string or the literal UNKNOWN.
export const View3PayloadSchema = z
  .object({
    status: ViewStatusSchema,
    stages: z.array(
      z
        .object({
          stage_name: z.string().min(1),
          action: z.string().min(1),
          cue: z.string().min(1),
          duration: z.union([z.string().min(1), z.literal('UNKNOWN')]),
          tag: ClaimTagCardMethodInferredSchema,
        })
        .strict(),
    ),
    incomplete_reason: z.string().nullable(),
  })
  .strict();
export type View3Payload = z.infer<typeof View3PayloadSchema>;
