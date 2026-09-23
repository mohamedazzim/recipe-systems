// One-shot utility: generate a new Add-Recipe banner with negative space on the
// LEFT (for text overlay) and ingredients on the right. Reads GEMINI_API_KEY.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const envText = readFileSync(join(ROOT, '.env'), 'utf8');
    const line = envText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.startsWith('GEMINI_API_KEY='));
    if (line) return line.slice('GEMINI_API_KEY='.length).replace(/^["']|["']$/g, '');
  } catch {
    /* ignore */
  }
  return '';
}

const API_KEY = loadApiKey();
if (!API_KEY) {
  console.error('GEMINI_API_KEY not found in env or .env');
  process.exit(2);
}

const MODELS = ['gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'];

async function generate(prompt, aspectRatio) {
  let lastError = null;
  for (const model of MODELS) {
    for (const body of [
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], aspectRatio } },
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } },
    ]) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          lastError = new Error(`${model} HTTP ${res.status}: ${text.slice(0, 400)}`);
          continue;
        }
        const json = await res.json();
        const parts = json?.candidates?.[0]?.content?.parts ?? [];
        const image = parts.find((p) => p.inlineData?.data);
        if (!image) {
          lastError = new Error(`${model} returned no inline image data`);
          continue;
        }
        return Buffer.from(image.inlineData.data, 'base64');
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError ?? new Error('image generation failed');
}

const prompt =
  'Wide premium editorial food photography for a text-overlay hero banner. Fresh ingredients — a chef knife on a wooden cutting board, fresh basil, ripe tomatoes, garlic and a small cruet of olive oil — arranged on the RIGHT two-thirds of the frame. The LEFT third is clean, soft warm ivory linen with generous empty negative space for text. Bright natural window light, soft shadows, warm palette, editorial culinary magazine style. Absolutely no text, no letters, no watermark, no people.';

try {
  const data = await generate(prompt, '16:9');
  const out = join(ROOT, 'apps', 'web', 'public', 'images', 'create-banner.png');
  writeFileSync(out, data);
  console.log(`OK create-banner.png (${data.length} bytes)`);
} catch (err) {
  console.error(`FAIL create-banner.png: ${err.message}`);
  process.exit(1);
}
