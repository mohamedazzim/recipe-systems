import { View1PayloadSchema } from './view-1';
import { View2PayloadSchema } from './view-2';
import { View3PayloadSchema } from './view-3';
import { View4PayloadSchema } from './view-4';
import { View5PayloadSchema } from './view-5';
import { View6PayloadSchema } from './view-6';
import { View7PayloadSchema } from './view-7';
import { View8PayloadSchema } from './view-8';
import { View9PayloadSchema } from './view-9';

// The nine canonical view contracts \u2014 keyed exactly as the analyse response
// (API doc \u00a75: views: { view_1 .. view_9 }).
export const VIEW_SCHEMAS = {
  view_1: View1PayloadSchema,
  view_2: View2PayloadSchema,
  view_3: View3PayloadSchema,
  view_4: View4PayloadSchema,
  view_5: View5PayloadSchema,
  view_6: View6PayloadSchema,
  view_7: View7PayloadSchema,
  view_8: View8PayloadSchema,
  view_9: View9PayloadSchema,
} as const;
