// Deterministic OCR stub — CI / local-dev only (Q10 stays OPEN; never production).
// The stub emits the golden card's expected lines so the full photo → OCR →
// draft → needs_review pipeline stays exercised in CI with no provider and no
// network. One line is deliberately LOW-confidence to exercise INV-04 (flagged,
// never dropped).

import type { OcrAdapter, OcrLine, OcrResult } from './index';

export const STUB_OCR_PROVIDER = 'stub';

export const GOLDEN_OCR_LINES: OcrLine[] = [
  { text: 'Fish - 500g', confidence: 0.98 },
  { text: 'Drumstick - 1 Nos', confidence: 0.96 },
  { text: 'Mango - 1/2 Nos', confidence: 0.95 },
  { text: 'Grated Coconut - Half Shell', confidence: 0.94 },
  { text: 'Coconut Oil - For Tempering', confidence: 0.93 },
  { text: 'Chilli - 5 Nos', confidence: 0.92 },
  { text: 'Chilli Powder - 2 Tsp', confidence: 0.91 },
  { text: 'Coriander Powder - 1 Tsp', confidence: 0.9 },
  { text: 'Tamarind - A Lemon Size', confidence: 0.94 },
  { text: 'Fenugreek Powder - 1/2 Tsp', confidence: 0.45 }, // low → needs_review
  { text: 'Fenugreek - 1/4 Tsp', confidence: 0.93 },
];

export class StubOcrAdapter implements OcrAdapter {
  async recognize(_image: Uint8Array, _contentType: string): Promise<OcrResult> {
    return {
      recognized_text: GOLDEN_OCR_LINES.map((l) => l.text).join('\n'),
      lines: GOLDEN_OCR_LINES,
      source_metadata: {
        provider: STUB_OCR_PROVIDER,
        model: 'golden-card-deterministic',
        version: '1.0.0',
        note: 'CI stub — never a real-card benchmark result',
      },
    };
  }
}
