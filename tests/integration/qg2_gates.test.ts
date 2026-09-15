// QG2 static-gate fire proofs (D-01 done criterion: "plant one violation per gate
// in a scratch path, prove it is caught, remove the plants").
// The canonical repository is NEVER modified — every plant lives in a temp
// scratch tree, and the gate script is pointed at it via GATES_SCAN_ROOT.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execFileSync } = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const os = require('os');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const GATES = path.join(ROOT, 'scripts', 'regression-gates.sh');

interface Scratch {
  dir: string; // forward-slash path
  cleanup: () => void;
  write: (rel: string, content: string) => void;
}

/** Build an empty scan tree (apps/, packages/) and return a helper. */
function makeScratch(): Scratch {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-gates-')).replace(/\\/g, '/');
  fs.mkdirSync(path.join(dir, 'apps'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'packages'), { recursive: true });
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
    write(rel: string, content: string) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    },
  };
}

function runGates(scanDir: string): { exit: number; out: string } {
  try {
    const out = execFileSync('bash', [GATES], {
      encoding: 'utf8',
      env: { ...process.env, GATES_SCAN_ROOT: scanDir },
    });
    return { exit: 0, out };
  } catch (err: any) {
    return { exit: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('QG2 static gates fire on real violations (D-01 criterion)', () => {
  it('baseline: an empty scratch tree passes every gate', () => {
    const s = makeScratch();
    try {
      const result = runGates(s.dir);
      expect(result.exit).toBe(0);
      expect(result.out).toContain('RESULT: regression gates PASS');
    } finally {
      s.cleanup();
    }
  });

  it('one-writer: an analysis_* write outside the worker fires', () => {
    const s = makeScratch();
    try {
      s.write('apps/api/src/modules/whatever/service.ts', 'prisma.analysis.update({ where: {}, data: {} });\n');
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('analysis_* write-context reference outside apps/analysis-worker');
    } finally {
      s.cleanup();
    }
  });

  it('one-writer: a dietary_*/nutrition_* write outside the admin module fires', () => {
    const s = makeScratch();
    try {
      s.write('apps/web/app/page.tsx', 'prisma.dietaryAllergenDefinition.create({ data: {} });\n');
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('dietary_*/nutrition_* write outside the admin module');
    } finally {
      s.cleanup();
    }
  });

  it('one-writer: a cook_log write outside the API cook module fires (D-24)', () => {
    const s = makeScratch();
    try {
      s.write('apps/web/app/page.tsx', 'prisma.cookLog.create({ data: {} });\n');
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('cook_log* write outside the API cook module');
    } finally {
      s.cleanup();
    }
  });

  it('render read-only: a database write in packages/rendering fires', () => {
    const s = makeScratch();
    try {
      s.write('packages/rendering/src/index.ts', 'export const x = prisma.recipe.create({ data: {} });\n');
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('packages/rendering must be read-only');
    } finally {
      s.cleanup();
    }
  });

  it('DDL: CREATE TABLE outside the Prisma migrations directory fires', () => {
    const s = makeScratch();
    try {
      s.write('apps/api/scripts/setup.sql', 'CREATE TABLE sneaky (id int);\n');
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('DDL outside Prisma migrations');
    } finally {
      s.cleanup();
    }
  });

  it('provenance: a non-canonical claim_tag value fires', () => {
    const s = makeScratch();
    try {
      s.write('apps/api/src/modules/x/service.ts', "const claim = { claim_tag: 'BOGUS' };\n");
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('non-canonical claim_tag');
    } finally {
      s.cleanup();
    }
  });

  it('disclaimers: an assertions YAML missing the no-"safe"/band markers fires', () => {
    const s = makeScratch();
    try {
      s.write('tests/assertions/golden_recipe_assertions.yaml', 'invariants:\n  something: unrelated\n');
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('missing the no-"safe" or no-point-kcal assertions');
    } finally {
      s.cleanup();
    }
  });

  // D-21 fire-proofs: the canonical texts are copied here verbatim so the planted
  // file fires ONLY the targeted gate.
  const H6 =
    'Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.';
  const I6 =
    'Table estimate from stated assumptions. Not a lab analysis. Not medical advice.';

  function plantedProducer(extra: string): string {
    return [
      `export const H6_DISCLAIMER = '${H6}';`,
      `export const I6_DISCLAIMER = '${I6}';`,
      'export const band = { energy_kcal_min: 1300, energy_kcal_max: 2200 };',
      extra,
    ].join('\n');
  }

  it('disclaimers: a planted "safe" on the View 8 producer surface fires (INV-13 static)', () => {
    const s = makeScratch();
    try {
      s.write(
        'apps/analysis-worker/src/deterministic-views.ts',
        plantedProducer('export const removalNote = "safe to eat for most people";\n'),
      );
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('View 8 producer output surface');
    } finally {
      s.cleanup();
    }
  });

  it('disclaimers: a paraphrased H6 text fires the verbatim gate', () => {
    const s = makeScratch();
    try {
      s.write(
        'apps/analysis-worker/src/deterministic-views.ts',
        [
          "export const H6_DISCLAIMER = 'Reads the card only. Not medical advice.';",
          `export const I6_DISCLAIMER = '${I6}';`,
          'export const band = { energy_kcal_min: 1300, energy_kcal_max: 2200 };',
        ].join('\n'),
      );
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('H6/I6 disclaimer texts must appear verbatim');
    } finally {
      s.cleanup();
    }
  });

  it('disclaimers: a point-kcal producer (one band bound missing) fires (INV-14 static)', () => {
    const s = makeScratch();
    try {
      s.write(
        'apps/analysis-worker/src/deterministic-views.ts',
        [
          `export const H6_DISCLAIMER = '${H6}';`,
          `export const I6_DISCLAIMER = '${I6}';`,
          'export const band = { energy_kcal_max: 2200 };',
        ].join('\n'),
      );
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('INV-14: the View 9 producer');
    } finally {
      s.cleanup();
    }
  });

  it('disclaimers: a planted "safe" on the View 8/9 web render surface fires (INV-13 static)', () => {
    const s = makeScratch();
    try {
      s.write(
        'apps/web/components/app/AnalysisViews.tsx',
        [
          'export const V8 = <p>{payload.disclaimer}</p>;',
          'export const V9 = <p>{payload.disclaimer}</p>;',
          'export const band = `${payload.band.energy_kcal_min}–${payload.band.energy_kcal_max}`;',
          'export const copy = "It is safe to cook without the fish.";',
        ].join('\n'),
      );
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('web render surface');
    } finally {
      s.cleanup();
    }
  });

  it('golden test presence: a fixture with no referencing test fires', () => {
    const s = makeScratch();
    try {
      s.write('tests/fixtures/golden_kanyakumari_card.json', '{}\n');
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('no non-skipped golden test found');
    } finally {
      s.cleanup();
    }
  });

  it('immutability: a prisma.recipeInput.update reference fires', () => {
    const s = makeScratch();
    try {
      s.write('apps/api/src/modules/x/service.ts', 'prisma.recipeInput.update({ where: {}, data: {} });\n');
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('recipe_input must be immutable');
    } finally {
      s.cleanup();
    }
  });

  it('immutability: raw SQL DELETE FROM recipe_input fires', () => {
    const s = makeScratch();
    try {
      s.write('apps/api/scripts/purge.sql', "DELETE FROM recipe_input WHERE id = 'x';\n");
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('recipe_input must be immutable');
    } finally {
      s.cleanup();
    }
  });

  it('INV-05: a shadow readiness column in schema.prisma fires (A-14 drift MAJOR)', () => {
    const s = makeScratch();
    try {
      s.write(
        'packages/database/prisma/schema.prisma',
        'model Recipe {\n  id String @id\n  review_complete Boolean @default(false)\n}\n',
      );
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('shadow enqueue-readiness state');
    } finally {
      s.cleanup();
    }
  });

  it('INV-05: a shadow readiness column in raw SQL fires', () => {
    const s = makeScratch();
    try {
      s.write('apps/api/scripts/patch.sql', 'ALTER TABLE recipe ADD COLUMN ready_for_analysis boolean;\n');
      const result = runGates(s.dir);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('shadow enqueue-readiness state');
    } finally {
      s.cleanup();
    }
  });

  it('the REAL repository tree still passes every gate (no accidental drift)', () => {
    const result = runGates(ROOT.replace(/\\/g, '/'));
    expect(result.exit).toBe(0);
    expect(result.out).toContain('RESULT: regression gates PASS');
  });
});
