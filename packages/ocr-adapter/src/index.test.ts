import { OCR_ADAPTER_SEAM } from './index';

describe('ocr-adapter package bootstrap', () => {
  it('exposes the provider-neutral seam note (Q10 stays OPEN; no provider selected here)', () => {
    expect(OCR_ADAPTER_SEAM).toMatch(/provider-neutral/);
  });
});
