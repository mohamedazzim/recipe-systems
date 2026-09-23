// The PDF engine launches headless Chromium (Tech Stack §12). `@playwright/test`
// ships the DRIVER only — the browser binary is fetched separately, which is why
// CI runs `npx playwright install --with-deps chromium` as its own step.
//
// The deployed API image needs the same step or every PDF render fails at
// runtime (PdfRenderError → the retryable 503 "PDF generation failed"). This
// package is built ONLY by the api service (the web build command skips it), so
// hooking the install into `build` targets exactly that image.
//
// Idempotent: Playwright skips a browser that is already in its cache.
// Never fatal: a failed download must not break the whole deploy — the print
// surface already degrades to a retryable error.
const { execSync } = require('node:child_process');

// System libraries are only apt-manageable on the Linux build image.
const withDeps = process.platform === 'linux' ? ' --with-deps' : '';

try {
  // execSync (shell) so `npx`/`npx.cmd` resolves on every platform. Static
  // command — no interpolated input.
  execSync(`npx playwright install${withDeps} chromium`, { stdio: 'inherit' });
  console.log('[rendering] chromium is available for the PDF engine');
} catch (err) {
  console.warn(
    '[rendering] chromium install failed — PDF rendering will fail at runtime:',
    err.message,
  );
}
