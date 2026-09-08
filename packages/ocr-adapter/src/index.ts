// Provider-neutral OCR adapter — Tech Stack §11.
// Contract: recognized text, line/word information, confidence, source metadata (Tech Stack §11).
// Confidence flows into the ERD OCR fields; if a provider exposes no reliable confidence, the
// system uses a conservative review policy rather than inventing a score (Tech Stack §11).
export interface OcrLine {
  text: string;
  confidence?: number;
}

export interface OcrResult {
  recognized_text: string;
  lines: OcrLine[];
  source_metadata: Record<string, unknown>;
}

export interface OcrAdapter {
  recognize(image_uri: string): Promise<OcrResult>;
}

export const OCR_ADAPTER_SEAM = 'provider-neutral (Tech Stack §11; Q10 OPEN — benchmark wks 1–4)';
