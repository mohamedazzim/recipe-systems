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

  it('the REAL repository tree still passes every gate (no accidental drift)', () => {
    const result = runGates(ROOT.replace(/\\/g, '/'));
    expect(result.exit).toBe(0);
    expect(result.out).toContain('RESULT: regression gates PASS');
  });
});
