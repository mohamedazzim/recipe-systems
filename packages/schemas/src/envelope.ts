import { z } from 'zod';
import { IdentificationSchema } from './identification';
import { StationCardSchema } from './station-card';
import { ClaimTagSchema } from './shared';
import { VIEW_SCHEMAS } from './views';

// Canonical analysis response envelope — API doc §5 POST /recipes/:recipeId/analyse
// 200 (Story RS-US-13): { analysis_id, mode, identification, views{view_1..view_9},
// claim_tags, station_card|null, is_latest, model_version, prompt_version }.
// The views object is exported separately so consumers and tests can prove the
// envelope uses the SAME schema instances as VIEW_SCHEMAS (single source of truth).
export const ANALYSIS_ENVELOPE_VIEWS = z
  .object({
    view_1: VIEW_SCHEMAS.view_1,
    view_2: VIEW_SCHEMAS.view_2,
    view_3: VIEW_SCHEMAS.view_3,
    view_4: VIEW_SCHEMAS.view_4,
    view_5: VIEW_SCHEMAS.view_5,
    view_6: VIEW_SCHEMAS.view_6,
    view_7: VIEW_SCHEMAS.view_7,
    view_8: VIEW_SCHEMAS.view_8,
    view_9: VIEW_SCHEMAS.view_9,
  })
  .strict();

export const AnalysisEnvelopeSchema = z
  .object({
    analysis_id: z.string().uuid(),
    mode: z.enum(['home', 'chef']),
    identification: IdentificationSchema,
    views: ANALYSIS_ENVELOPE_VIEWS,
    claim_tags: z.record(ClaimTagSchema, z.number().int().nonnegative()),
    station_card: StationCardSchema.nullable(),
    is_latest: z.boolean(),
    model_version: z.string().min(1),
    prompt_version: z.string().min(1),
  })
  .strict();
export type AnalysisEnvelope = z.infer<typeof AnalysisEnvelopeSchema>;
