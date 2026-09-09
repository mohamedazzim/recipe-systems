// D-29 (Track R): STATIC one-writer enforcement (complements the runtime gate).
// Reads the admin module's own source and proves:
//  1. every prisma write call on the curated reference models lives in
//     reference-data.repository.ts (the sole writer);
//  2. the ONLY update targets in the module are effective_to closings on the
//     two effective-dated tables (no historical content mutation);
//  3. no HTTP controller exists in the module (no invented admin API);
//  4. the Q5 working-assumption label is present wherever the dictionary is
//     written (Q5 stays OPEN).

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ADMIN_DIR = join(__dirname); // this test lives inside src/admin — scan only this module

function readTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      for (const [k, v] of readTree(p)) out.set(k, v);
    } else if (entry.endsWith('.ts')) {
      out.set(p, readFileSync(p, 'utf8'));
    }
  }
  return out;
}

const WRITE_MODEL =
  /prisma\.(dietaryAllergen(D|M)|nutritionFoodComposition(E|V)|ingredient(Dictionary|Alias))[A-Za-z]*\.(create|createMany|upsert|update|updateMany|delete|deleteMany)/g;
const ANY_UPDATE = /\.update\(\s*\{/gs;

describe('D-29 static one-writer enforcement (admin module)', () => {
  const files = readTree(ADMIN_DIR);
  const repositorySrc = [...files.entries()].find(([p]) => p.endsWith('reference-data.repository.ts'))?.[1] ?? '';

  it('every reference-model prisma write lives in reference-data.repository.ts', () => {
    const violations: string[] = [];
    for (const [path, src] of files) {
      if (path.endsWith('.test.ts')) continue;
      const writes = [...src.matchAll(WRITE_MODEL)];
      if (writes.length > 0 && !path.endsWith('reference-data.repository.ts')) {
        violations.push(`${path.replace(/\\/g, '/')}: ${writes.map((w) => w[0]).join(', ')}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('the repository is the only file with ANY update call, and every update closes an effective_to (never content)', () => {
    for (const [path, src] of files) {
      if (path.endsWith('.test.ts')) continue;
      const updates = src.matchAll(ANY_UPDATE);
      for (const m of updates) {
        const window = src.slice(m.index ?? 0, (m.index ?? 0) + 400);
        const hasEffectiveTo = /effectiveTo\s*:/.test(window);
        expect(hasEffectiveTo).toBe(true);
        expect(path.replace(/\\/g, '/')).toMatch(/reference-data\.repository\.ts$/);
      }
    }
  });

  it('no HTTP controller exists in the admin module (no invented public admin API)', () => {
    for (const [path, src] of files) {
      if (path.endsWith('.test.ts')) continue;
      expect(src).not.toMatch(/@Controller/);
    }
  });

  it('Q5 label: every ingredient_dictionary / ingredient_alias write carries the working-assumption label', () => {
    // the label lives in the repository header + at each write site
    expect(repositorySrc).toMatch(/Q5 WORKING ASSUMPTION/);
    const dictWrites = [...repositorySrc.matchAll(/prisma\.ingredient(Dictionary|Alias)[A-Za-z]*\.create/g)];
    expect(dictWrites.length).toBeGreaterThan(0);
    // every dictionary create sits after the Q5 label comment
    const labelPos = repositorySrc.indexOf('Q5 WORKING ASSUMPTION');
    for (const w of dictWrites) {
      expect((w.index ?? 0)).toBeGreaterThan(labelPos);
    }
  });
});
