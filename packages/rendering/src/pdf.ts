// D-23 — the canonical PDF engine (Tech Stack §12: Playwright + headless
// Chromium). The runtime is injectable so unit tests cover every QG4 failure
// cell without launching a browser; the default runtime is the real Chromium.
//
// Failure contract (TEST_PLAN QG4 "PDF render | failure | P5"): a render
// failure maps to PdfRenderError — the API surfaces it as a RETRYABLE error
// and never returns a blank or partial PDF. Bounded in-engine retries (2
// attempts by default) cover transient Chromium failures.

import { chromium } from '@playwright/test';

export class PdfRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfRenderError';
  }
}

/** Injectable Chromium runtime — unit tests fake this; production uses
 *  `chromiumRuntime()` (headless, no sandbox flags beyond defaults). */
export interface PdfRuntime {
  renderToPdf(html: string, timeoutMs: number): Promise<Buffer>;
  /** Layout measurement at A4 viewport — the one-page proof (no clipping). */
  measureHeight(html: string, timeoutMs: number): Promise<number>;
}

export function chromiumRuntime(): PdfRuntime {
  return {
    async renderToPdf(html, timeoutMs) {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        page.setDefaultTimeout(timeoutMs);
        await page.setContent(html, { waitUntil: 'load' });
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        return Buffer.from(pdf);
      } finally {
        await browser.close();
      }
    },
    async measureHeight(html, timeoutMs) {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
        page.setDefaultTimeout(timeoutMs);
        await page.setContent(html, { waitUntil: 'load' });
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        return height as number;
      } finally {
        await browser.close();
      }
    },
  };
}

export interface RenderPdfOptions {
  /** Bounded in-engine attempts for transient Chromium failures. */
  attempts?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Render HTML to a PDF buffer; throws PdfRenderError (retryable) on every
 *  failure — never a blank/partial PDF. */
export async function renderPdf(
  html: string,
  runtime: PdfRuntime,
  options: RenderPdfOptions = {},
): Promise<Buffer> {
  const attempts = Math.max(1, options.attempts ?? 2);
  const timeoutMs = options.timeoutMs ?? 30_000;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await runtime.renderToPdf(html, timeoutMs);
    } catch (err) {
      lastError = err;
      if (attempt + 1 < attempts) {
        await sleep(250 * (attempt + 1));
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new PdfRenderError(`PDF render failed after ${attempts} attempt(s): ${message}`);
}
