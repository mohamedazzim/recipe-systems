// Shared frontend types — mirror of the BFF's JSON wire shapes (BFF remains
// authoritative; these exist only so views can render the real responses).

export interface User {
  id: string;
  email: string;
  preferred_mode: string;
  label_pack: string | null;
}

/** API doc §3 wire line (D-12B mapping). `amount` is the display amount text. */
export interface WireLine {
  id: string;
  line_no: number;
  display_name: string;
  amount: string | null;
  unit: string | null;
  quantity: number | null;
  category: string | null;
  confirmed_sense: string | null;
  include_on_list: boolean;
  is_header: boolean;
  needs_review: boolean;
  ocr_confidence: number | null;
  source_tag:
    | 'CARD'
    | 'METHOD'
    | 'INFERRED'
    | 'ABSENT'
    | 'UNKNOWN'
    | 'ASSUMED'
    | null;
  updated_at: string;
  /** D-25 B6: the resolved canonical ingredient (dictionary/alias path) and the
   *  ambiguity flag. Present on the current API wire; optional here so older
   *  fixtures and the parse-text path (which may omit them) stay valid. */
  canonical_name?: string | null;
  requires_confirmation?: boolean;
}

export interface ParseTextResponse {
  recipe_id: string;
  recipe: {
    raw_text: string;
    lines: WireLine[];
    flags: string[];
    /** RS-US servings: the serving count detected from the source text (null when silent). */
    servings?: number | null;
    /** RS-US servings: true when the count is an LLM estimate (never a stated fact). */
    servings_estimated?: boolean;
  };
}

/** D-11 (B2): POST /recipes/upload wire (photo → OCR). `lines` is populated on
 *  a completed OCR pass; empty for the `disabled` case. On `pending`/`unreadable`
 *  the endpoint returns 503/422 instead (the photo + input stay durable). */
export interface UploadResponse {
  recipe_id: string;
  image_id: string;
  file_key: string;
  /** Dish title transcribed from the card (null when the card has none). */
  title?: string | null;
  /** RS-US servings: the serving count detected from the OCR'd text (null when silent). */
  servings?: number | null;
  /** RS-US servings: true when the count is an LLM estimate (never a stated fact). */
  servings_estimated?: boolean;
  ocr: {
    status: 'complete' | 'disabled';
    draft_line_count: number;
    flagged_count: number;
  };
  lines: WireLine[];
}

/** Phase 2 (bulk upload): POST/GET /recipes/import/documents wire shape. */
export interface DocumentIngestionResponse {
  ingestion_id: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  status:
    | 'queued'
    | 'extracting'
    | 'ready'
    | 'failed'
    | 'extracting_structure'
    | 'draft_ready'
    | 'extraction_failed';
  has_text: boolean;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Phase 3: one source-faithful recipe draft (NOT a confirmed recipe). */
export interface ExtractedIngredientDraft {
  name: string;
  quantity: string | null;
  unit: string | null;
  preparation: string | null;
  source: string;
  needs_review: boolean;
}

export interface ExtractedMethodStepDraft {
  text: string;
  source: string | null;
  needs_review: boolean;
}

export interface RecipeDraft {
  title: string | null;
  title_needs_review: boolean;
  ingredients: ExtractedIngredientDraft[];
  method_steps: ExtractedMethodStepDraft[];
  needs_review: boolean;
  notes: string[];
}

export interface DocumentDraft {
  draft_id: string;
  draft_index: number;
  title: string | null;
  title_needs_review: boolean;
  needs_review: boolean;
  payload: RecipeDraft;
  user_payload: DraftEdit | null;
  status: 'draft' | 'confirming' | 'confirmed';
  recipe_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Phase 4: provenance of an editable draft row — source-faithful vs user edit. */
export type DraftProvenance = 'source' | 'user_corrected' | 'user_added';

export interface DraftIngredient {
  name: string;
  quantity: string | null;
  unit: string | null;
  preparation: string | null;
  provenance: DraftProvenance;
  source: string | null;
  needs_review: boolean;
}

export interface DraftMethodStep {
  text: string;
  provenance: DraftProvenance;
  source: string | null;
  needs_review: boolean;
}

/** The authoritative, user-editable draft (PATCH body + persisted user_payload). */
export interface DraftEdit {
  title: string | null;
  title_needs_review: boolean;
  ingredients: DraftIngredient[];
  method_steps: DraftMethodStep[];
}

/** Phase 4: POST .../confirm wire. */
export interface ConfirmDraftResponse {
  recipe_id: string;
  status: 'confirmed' | 'already_confirmed';
}

/** API doc §4 method wire shape (D-13). */
export interface MethodState {
  method_tag: 'METHOD' | 'INFERRED' | null;
  method_source: string | null;
  /** Persisted method text — surfaced so the workspace shows the saved method. */
  method_text: string | null;
  list_only: boolean;
}

/** D-14 enqueue-state wire contract (read-only route). */
export interface EnqueueState {
  can_enqueue: boolean;
  blockers: Array<{ line_id: string; display_name: string }>;
}

export type AnalysisStatus = 'queued' | 'generating' | 'complete' | 'failed';

/** D-20 (P4-2): frozen station-card wire shape (D-05 StationCardSchema / API §5). */
export interface StationCard {
  station_card_id: string;
  analysis_id: string;
  mise: Record<string, { display_name: string; amount: string | null; tag: 'CARD' }>;
  sequence: Array<{
    stage_name: string;
    action: string;
    cue: string;
    duration: string;
    tag: string;
  }>;
  do_nots: Array<{ item: string; tag: 'ABSENT'; note: string }>;
  control_points: Array<{ stage_name: string; cue: string; tag: string }>;
  product_yield_hold: Record<string, unknown> | null;
  printable: boolean;
}

/** D-22 (D1): PUT /recipes/:recipeId/save wire — artifact presence, never copies. */
export interface SavedRecipe {
  recipe_id: string;
  title: string;
  saved_at: string;
  artifacts: {
    raw_input: boolean;
    photo: boolean;
    object: boolean;
    identification: boolean;
    analysis: boolean;
    timestamps: boolean;
  };
}

/** D-22 (D2): one canonical library row (AC-1 fields exactly). D-24 (F1 AC-3)
 *  adds `last_cooked_at` — date-only, null when never cooked. The dashboard
 *  read-model extension (2026-09-18) adds the stored card photo, analysis
 *  presence, and the latest shopping-list generation. Optional here so older
 *  fixtures stay valid. */
export interface LibraryRecipe {
  recipe_id: string;
  name: string;
  date: string;
  family: string | null;
  has_cook_log: boolean;
  last_cooked_at: string | null;
  photo_uri?: string | null;
  has_analysis?: boolean;
  has_shopping_list?: boolean;
  shopping_list_generated_at?: string | null;
}

/** Library status filter — the dashboard stat cards deep-link to these. */
export type LibraryFilter = 'all' | 'analysed' | 'shopping' | 'cooked';

/** D-24 (F1/F2/F6): one cook log (API §8 — POST/GET/PATCH wire). */
export interface CookLog {
  cook_log_id: string;
  recipe_id: string;
  cook_date: string;
  rating: number | null;
  note: string | null;
  next_time: string | null;
  /** D-4: photo presence — skip the GET /photo 404 when false. */
  has_photo: boolean;
  created_at: string;
}

/** D-24 (F1/F2/F6): GET /recipes/:recipeId/last-cook — the reopen summary. */
export interface LastCook {
  last_cooked_at: string | null;
  rating: number | null;
  next_time: string | null;
}

/** D-31 (F5): POST/GET /cook-logs/:cookLogId/photo wire (API §8). */
export interface PlatePhoto {
  cook_log_id: string;
  photo_uri: string;
}

/** D-26 (F3/H5): POST /cook-logs/:cookLogId/swaps wire (API §8). */
export interface SwapRecord {
  swap_id: string;
  cook_log_id: string;
  line_id: string | null;
  ingredient_name_snapshot: string;
  action: 'skipped' | 'reduced' | 'increased' | 'swapped';
  swapped_to: string | null;
  reason: 'restriction' | 'pantry' | 'other' | null;
  applied_to_card: boolean;
  created_at: string;
}

/** D-26 (H1): GET/PUT /me/restriction-profile wire (API §9). */
export interface RestrictionProfile {
  profile_id: string | null;
  allergens: string[];
  diet_patterns: string[];
  label_pack: 'US' | 'EU' | null;
}

/** D-26 (H1 UI): GET /restriction-vocabulary wire. */
export interface RestrictionVocabulary {
  allergens: Array<{ code: string; name: string; label_pack: string | null }>;
  diet_patterns: string[];
}

/** D-26 (H3): GET /analysis/:analysisId/restriction-highlight wire. */
export interface RestrictionHighlight {
  conflicts: string[];
  unknown: string[];
  not_flagged: string[];
  profile_notes: string[];
}

/** D-30 (Track S): the canonical five market groups (E3). */
export type ShoppingGroup = 'fresh produce' | 'fish/meat' | 'spices' | 'fats/oils' | 'other';

/** D-30 (Track S): one shopping row (E1/E2). */
export interface ShoppingItem {
  shopping_key: string | null;
  display_name: string;
  display_quantity: string;
  unit: string | null;
  group_name: ShoppingGroup;
  state: 'have' | 'need';
  position: number;
}

/** D-30 (Track S): the shopping-list wire (latest snapshot + current state). */
export interface ShoppingList {
  generation_id: string;
  recipe_id: string;
  layout: string;
  generated_at: string;
  allergen_line: string | null;
  groups: { name: ShoppingGroup; items: ShoppingItem[] }[];
}

/** GET /analysis/:id wire shape (D-17 read surface). */
export interface AnalysisState {
  analysis_id: string;
  status: AnalysisStatus;
  mode: 'home' | 'chef';
  is_latest: boolean;
  prompt_version: string;
  model_version: string | null;
  created_at?: string;
  views: Array<{
    view_number: number;
    view_key: string;
    status: 'COMPLETE' | 'INCOMPLETE';
    payload: unknown;
  }>;
  /** D-20 (P4-2): present only when the worker generated the card (method + View 3 COMPLETE). */
  station_card?: StationCard | null;
}

export interface AnalyseAck {
  analysis_id: string;
  status: 'queued';
  prompt_version: string;
}

/** Client-side session record (localStorage): recipes created in this browser.
 *  `owner` tags the creating identity so cross-session recipes are never
 *  offered to the wrong actor (the backend correctly 404s foreign recipes). */
export interface SessionRecipe {
  recipe_id: string;
  created_at: string;
  preview: string;
  /** 'user:<accountId>' or 'guest'; absent on legacy records. */
  owner?: string;
  /** Guest-created records keep the parse response (QA-B1 fix) for read-only reopens. */
  lines?: WireLine[];
}
