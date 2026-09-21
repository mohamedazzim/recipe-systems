// @recipe-systems/schemas \u2014 canonical D-05 contract surface.
// Single active frozen contract set (SCHEMA_VERSION). Nothing else in this package
// is canonical: consumers import from here or the named submodules below.
export {
  SCHEMA_VERSION,
  NINE_VIEW_SCHEMAS_FROZEN_AT,
  SCHEMA_FREEZE_DATE,
} from './version';

export {
  CLAIM_TAGS,
  ClaimTagSchema,
  ClaimSchema,
  LabelPackSchema,
  AnalysisModeSchema,
  ViewStatusSchema,
  ConfidenceSchema,
  StructuredRecipeInputSchema,
  DeterministicViewInputSchema,
  View9AssumptionsSchema,
} from './shared';
export type {
  ClaimTag,
  Claim,
  LabelPack,
  AnalysisMode,
  ViewStatus,
  Confidence,
  StructuredRecipeInput,
  DeterministicViewInput,
  View9Assumptions,
} from './shared';

export { IdentificationSchema } from './identification';
export type { Identification } from './identification';

export { StationCardSchema } from './station-card';
export type { StationCard } from './station-card';

export { VIEW_SCHEMAS } from './views';
export { View1PayloadSchema } from './views/view-1';
export { View2PayloadSchema } from './views/view-2';
export { View3PayloadSchema } from './views/view-3';
export { View4PayloadSchema } from './views/view-4';
export { View5PayloadSchema } from './views/view-5';
export { View6PayloadSchema } from './views/view-6';
export { View7PayloadSchema } from './views/view-7';
export { View8PayloadSchema } from './views/view-8';
export { View9PayloadSchema } from './views/view-9';
export type {
  View1Payload,
} from './views/view-1';
export type {
  View2Payload,
} from './views/view-2';
export type {
  View3Payload,
} from './views/view-3';
export type {
  View4Payload,
} from './views/view-4';
export type {
  View5Payload,
} from './views/view-5';
export type {
  View6Payload,
} from './views/view-6';
export type {
  View7Payload,
} from './views/view-7';
export type {
  View8Payload,
} from './views/view-8';
export type {
  View9Payload,
} from './views/view-9';

export { AnalysisEnvelopeSchema, ANALYSIS_ENVELOPE_VIEWS } from './envelope';
export type { AnalysisEnvelope } from './envelope';

export {
  DocumentExtractionSchema,
  ExtractedIngredientSchema,
  ExtractedMethodStepSchema,
  RecipeExtractionSchema,
} from './extraction';
export type {
  DocumentExtraction,
  ExtractedIngredient,
  ExtractedMethodStep,
  RecipeExtraction,
} from './extraction';

export {
  DRAFT_PROVENANCE,
  DRAFT_STATUS,
  DraftEditSchema,
  DraftIngredientSchema,
  DraftMethodStepSchema,
  DraftProvenanceSchema,
  DraftStatusSchema,
} from './draft';
export type {
  DraftEdit,
  DraftIngredient,
  DraftMethodStep,
  DraftProvenance,
  DraftStatus,
} from './draft';
