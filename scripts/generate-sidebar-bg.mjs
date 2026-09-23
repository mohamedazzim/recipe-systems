// One-shot utility: generate a full-height botanical background for the dark
// sidebar — leaves growing from the bottom edge upward to about half the panel,
// on a solid deep forest-green background (top half clean for the nav).
// Reads GEMINI_API_KEY from the repo root .env (never committed).

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
  'Tall vertical botanical background for a dark navigation sidebar. Lush fresh basil, rosemary and thyme herb leaves grow upward from the very bottom edge, reaching up to about half of the image height, then fading out. The top half is completely clean solid very dark forest green (a deep muted green-black) with no elements, no pattern. Moody, elegant, premium, natural light, deep shadows. Absolutely no text, no letters, no numbers, no symbols, no watermark, no logo, no people. Portrait orientation.';

try {
  const data = await generate(prompt, '9:16');
  const out = join(ROOT, 'apps', 'web', 'public', 'images', 'sidebar-leaf-bg.png');
  writeFileSync(out, data);
  console.log(`OK sidebar-leaf-bg.png (${data.length} bytes)`);
} catch (err) {
  console.error(`FAIL sidebar-leaf-bg.png: ${err.message}`);
  process.exit(1);
}
