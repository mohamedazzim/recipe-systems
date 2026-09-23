// One-shot utility: generate vibe-matching editorial culinary images for the
// remaining app pages (Create, Household, Workspace, Draft review).
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

const TARGETS = [
  {
    file: 'draft-banner.png',
    aspectRatio: '16:9',
    prompt:
      'Wide premium editorial food photography: fresh culinary herbs (basil, rosemary and thyme), whole peppercorns and a wooden spoon arranged on a warm ivory linen background. Bright natural light, soft shadows, warm neutral palette, editorial magazine style, generous negative space. No paper, no notebook, no pencil, no writing. Absolutely no text, no letters, no numbers, no watermark.',
  },
];

mkdirSync(join(ROOT, 'apps', 'web', 'public', 'images'), { recursive: true });

for (const target of TARGETS) {
  try {
    const data = await generate(target.prompt, target.aspectRatio);
    const out = join(ROOT, 'apps', 'web', 'public', 'images', target.file);
    writeFileSync(out, data);
    console.log(`OK ${target.file} (${data.length} bytes)`);
  } catch (err) {
    console.error(`FAIL ${target.file}: ${err.message}`);
    process.exitCode = 1;
  }
}
