// One-shot utility: compress the generated hero/banner PNGs into optimized
// JPEGs (photos compress far smaller than PNG) so Railway uploads and page
// loads stay fast. Writes `<name>.jpg` next to each PNG.

import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const IMG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'images');

const TARGETS = [
  { name: 'hero-food', maxWidth: 1600, quality: 82 },
  { name: 'start-recipe-clean', maxWidth: 1600, quality: 82 },
  { name: 'sidebar-leaf-bg', maxWidth: 800, quality: 82 },
  { name: 'create-banner', maxWidth: 1600, quality: 82 },
  { name: 'household-banner', maxWidth: 1600, quality: 82 },
  { name: 'draft-banner', maxWidth: 1600, quality: 82 },
];

for (const target of TARGETS) {
  const src = join(IMG_DIR, `${target.name}.png`);
  const dst = join(IMG_DIR, `${target.name}.jpg`);
  if (!existsSync(src)) {
    console.log(`SKIP ${target.name}.png (missing)`);
    continue;
  }
  const before = readFileSync(src).length;
  await sharp(src)
    .resize({ width: target.maxWidth, withoutEnlargement: true })
    .jpeg({ quality: target.quality, mozjpeg: true })
    .toFile(dst);
  const after = readFileSync(dst).length;
  console.log(
    `OK ${target.name}.jpg  ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024 / 1024).toFixed(2)} MB`,
  );
}

const dirFiles = await readdir(IMG_DIR);
console.log('\nimages dir:', dirFiles.join(', '));
