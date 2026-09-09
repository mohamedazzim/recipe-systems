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
}

export interface AnalyseAck {
  analysis_id: string;
  status: 'queued';
  prompt_version: string;
}

/** Client-side session record (localStorage): recipes created in this browser. */
export interface SessionRecipe {
  recipe_id: string;
  created_at: string;
  preview: string;
}
