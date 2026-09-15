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
  source_tag: 'CARD' | 'OCR' | null;
  updated_at: string;
}

export interface ParseTextResponse {
  recipe_id: string;
  recipe: {
    raw_text: string;
    lines: WireLine[];
    flags: string[];
  };
}

/** API doc §4 method wire shape (D-13). */
export interface MethodState {
  method_tag: 'METHOD' | 'INFERRED' | null;
  method_source: string | null;
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
 *  adds `last_cooked_at` — date-only, null when never cooked. */
export interface LibraryRecipe {
  recipe_id: string;
  name: string;
  date: string;
  family: string | null;
  has_cook_log: boolean;
  last_cooked_at: string | null;
}

/** D-24 (F1/F2/F6): one cook log (API §8 — POST/GET/PATCH wire). */
export interface CookLog {
  cook_log_id: string;
  recipe_id: string;
  cook_date: string;
  rating: number | null;
  note: string | null;
  next_time: string | null;
  created_at: string;
}

/** D-24 (F6): GET /recipes/:recipeId/last-cook — the reopen summary. */
export interface LastCook {
  last_cooked_at: string | null;
  rating: number | null;
  next_time: string | null;
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
