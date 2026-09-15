// D-11 (P2-2): the OCR adapter provider — resolves the provider-neutral adapter
// from the environment and exposes it under the OCR_ADAPTER token. OCR is
// Intake-only (ADR §2 Decision 3); no other module consumes this token.

import { Global, Module } from '@nestjs/common';
import { OcrAdapter, resolveOcrAdapter } from '@recipe-systems/ocr-adapter';

export const OCR_ADAPTER = 'OCR_ADAPTER';

@Global()
@Module({
  providers: [
    {
      provide: OCR_ADAPTER,
      useFactory: (): OcrAdapter | null => resolveOcrAdapter(process.env),
    },
  ],
  exports: [OCR_ADAPTER],
})
export class OcrModule {}
