import { z } from 'zod';

// Canonical station-card contract \u2014 API doc \u00a75 GET /analysis/:analysisId/station-card
// 200 response (Stories RS-US-16 / RS-US-29), matching ERD \u00a7analysis_station_card
// (mise, sequence, do_nots, control_points, product_yield_hold nullable, printable).
export const StationCardSchema = z
  .object({
    station_card_id: z.string().uuid(),
    analysis_id: z.string().uuid(),
    mise: z.record(z.string(), z.unknown()),
    sequence: z.array(z.unknown()),
    do_nots: z.array(z.unknown()),
    control_points: z.array(z.unknown()),
    product_yield_hold: z.record(z.string(), z.unknown()).nullable(),
    printable: z.boolean(),
  })
  .strict();
export type StationCard = z.infer<typeof StationCardSchema>;
