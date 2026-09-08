// Corpus validation tests (D-04 / QG5 Volume tier).
// Positive: canonical corpus passes every rule. Negative: each important
// validation class is proven to fire via a controlled mutation in a TEMP copy
// (the canonical corpus is never touched). D-03 golden fixture stays valid.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runChecks: runGoldenChecks } = require('../../scripts/golden-check.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execFileSync } = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const os = require('os');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CORPUS = path.join(ROOT, 'tests', 'fixtures', 'corpus');
const MESSY = path.join(ROOT, 'tests', 'fixtures', 'messy_20');
const REVIEWERS = path.join(ROOT, 'tests', 'fixtures', 'reviewers.json');
const GOLDEN = path.join(ROOT, 'tests', 'fixtures', 'golden_kanyakumari_card.json');
const CHECK = path.join(ROOT, 'scripts', 'corpus-check.js');

function runCheck(args: string[]): { exit: number; out: string } {
  try {
    const out = execFileSync('node', [CHECK, ...args], { encoding: 'utf8' });
    return { exit: 0, out };
  } catch (err: any) {
    return { exit: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

/** Copy a fixture dir to a temp location; returns cleanup fn. */
function copyDirToTemp(src: string, label: string): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rs-${label}-`));
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(dir, f));
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe('D-04 corpus validation', () => {
  it('canonical corpus + messy set pass every rule', () => {
    const result = runCheck(['--corpus', CORPUS, '--messy', MESSY, '--reviewers', REVIEWERS]);
    expect(result.exit).toBe(0);
  });

  it('corpus contains exactly 50 fixtures with ids rs-001..rs-050', () => {
    const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(50);
    const ids = files.map((f) => f.replace('.json', '')).sort();
    expect(ids[0]).toBe('rs-001');
    expect(ids[49]).toBe('rs-050');
  });

  it('messy_20 is a separate named set of exactly 20 (never merged into the corpus count)', () => {
    const files = fs.readdirSync(MESSY).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(20);
    for (const f of files) expect(f).toMatch(/^messy-\d{3}\.json$/);
  });

  it('every corpus fixture parses and carries the required structure', () => {
    for (const f of fs.readdirSync(CORPUS)) {
      if (!f.endsWith('.json')) continue;
      const fx = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
      expect(fx.id).toMatch(/^rs-\d{3}$/);
      expect(typeof fx.version).toBe('number');
      expect(fx.name).toBeTruthy();
      expect(fx.lines.length).toBeGreaterThan(0);
      expect(fx.provenance.synthetic).toBe(true);
      expect(fx.review.status).toBe('unassigned');
    }
  });

  it('all reviewer references resolve to declared slots and match their region', () => {
    const reviewers = JSON.parse(fs.readFileSync(REVIEWERS, 'utf8'));
    const slots = Object.keys(reviewers.slots);
    for (const f of fs.readdirSync(CORPUS)) {
      if (!f.endsWith('.json')) continue;
      const fx = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
      const slot = fx.review.reviewer_slot;
      if (slot !== null) expect(slots).toContain(slot);
      const expected = fx.region === 'tamil-nadu' ? 'tn_kanyakumari' : fx.region === 'kerala' ? 'kerala' : null;
      expect(slot).toBe(expected);
    }
  });

  it('regional/category coverage is complete (both reviewer regions, veg+non-veg, photo+paste+form)', () => {
    const result = runCheck(['--corpus', CORPUS, '--messy', MESSY, '--reviewers', REVIEWERS]);
    expect(result.exit).toBe(0);
    // presence asserted implicitly; make it explicit:
    const regions = new Set();
    const cats = new Set();
    const types = new Set();
    for (const f of fs.readdirSync(CORPUS)) {
      if (!f.endsWith('.json')) continue;
      const fx = JSON.parse(fs.readFileSync(path.join(CORPUS, f), 'utf8'));
      regions.add(fx.region);
      cats.add(fx.category);
      types.add(fx.input_type);
    }
    expect(regions.has('tamil-nadu')).toBe(true);
    expect(regions.has('kerala')).toBe(true);
    expect(cats.has('veg')).toBe(true);
    expect(cats.has('non-veg')).toBe(true);
    expect(types.has('photo')).toBe(true);
    expect(types.has('paste')).toBe(true);
    expect(types.has('form')).toBe(true);
  });

  it('rs-001 is the golden card seed: same lines, full expected block, passes all 8 invariants', () => {
    const seed = JSON.parse(fs.readFileSync(path.join(CORPUS, 'rs-001.json'), 'utf8'));
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    expect(seed.lines).toEqual(golden.card.lines);
    expect(seed.expected).toEqual(golden.expected);
    const results = runGoldenChecks({ card: { lines: seed.lines }, expected: seed.expected, method: seed.method });
    expect(results.every((r: any) => r.ok)).toBe(true);
  });

  it('D-03 golden fixture remains fully valid (8/8)', () => {
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    const results = runGoldenChecks(golden);
    expect(results).toHaveLength(8);
    expect(results.every((r: any) => r.ok)).toBe(true);
  });

  // --- negative proofs (temp copies only; canonical corpus untouched) ---

  it('rejects a duplicate fixture id', () => {
    const t = copyDirToTemp(CORPUS, 'dup');
    try {
      const target = path.join(t.dir, 'rs-050.json');
      const fx = JSON.parse(fs.readFileSync(target, 'utf8'));
      fx.id = 'rs-001'; // duplicate
      fs.writeFileSync(target, JSON.stringify(fx));
      const result = runCheck(['--corpus', t.dir, '--messy', MESSY, '--reviewers', REVIEWERS]);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('duplicate fixture id');
    } finally {
      t.cleanup();
    }
  });

  it('rejects a fixture missing a required field', () => {
    const t = copyDirToTemp(CORPUS, 'field');
    try {
      const target = path.join(t.dir, 'rs-010.json');
      const fx = JSON.parse(fs.readFileSync(target, 'utf8'));
      delete (fx as any).region;
      fs.writeFileSync(target, JSON.stringify(fx));
      const result = runCheck(['--corpus', t.dir, '--messy', MESSY, '--reviewers', REVIEWERS]);
      expect(result.exit).toBe(1);
      expect(result.out).toContain("missing required field 'region'");
    } finally {
      t.cleanup();
    }
  });

  it('rejects an invalid reviewer reference', () => {
    const t = copyDirToTemp(CORPUS, 'reviewer');
    try {
      const target = path.join(t.dir, 'rs-002.json');
      const fx = JSON.parse(fs.readFileSync(target, 'utf8'));
      fx.review.reviewer_slot = 'someone-else';
      fs.writeFileSync(target, JSON.stringify(fx));
      const result = runCheck(['--corpus', t.dir, '--messy', MESSY, '--reviewers', REVIEWERS]);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('does not resolve');
    } finally {
      t.cleanup();
    }
  });

  it('rejects missing regional coverage (a reviewer region with zero fixtures)', () => {
    const t = copyDirToTemp(CORPUS, 'coverage');
    try {
      // strip every kerala fixture from the temp copy
      for (const f of fs.readdirSync(t.dir)) {
        if (!f.endsWith('.json')) continue;
        const fx = JSON.parse(fs.readFileSync(path.join(t.dir, f), 'utf8'));
        if (fx.region === 'kerala') fs.unlinkSync(path.join(t.dir, f));
      }
      const result = runCheck(['--corpus', t.dir, '--messy', MESSY, '--reviewers', REVIEWERS]);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('no fixtures for reviewer region');
    } finally {
      t.cleanup();
    }
  });

  it('rejects an off-by-one corpus count (49 and 51 both fail)', () => {
    // 49: remove one fixture
    const t49 = copyDirToTemp(CORPUS, 'count49');
    try {
      fs.unlinkSync(path.join(t49.dir, 'rs-050.json'));
      const fewer = runCheck(['--corpus', t49.dir, '--messy', MESSY, '--reviewers', REVIEWERS]);
      expect(fewer.exit).toBe(1);
      expect(fewer.out).toContain('expected exactly 50');
    } finally {
      t49.cleanup();
    }
    // 51: add one fixture to the full set
    const t51 = copyDirToTemp(CORPUS, 'count51');
    try {
      const extra = {
        id: 'rs-051', version: 1, name: 'Extra', region: 'other', category: 'veg',
        input_type: 'paste', method: { provided: false }, lines: ['Salt — To Taste'],
        review: { reviewer_slot: null, status: 'unassigned' },
        provenance: { synthetic: true, note: 'planted' },
      };
      fs.writeFileSync(path.join(t51.dir, 'rs-051.json'), JSON.stringify(extra));
      const more = runCheck(['--corpus', t51.dir, '--messy', MESSY, '--reviewers', REVIEWERS]);
      expect(more.exit).toBe(1);
      expect(more.out).toContain('expected exactly 50');
    } finally {
      t51.cleanup();
    }
  });

  it('rejects a malformed (unparseable) fixture', () => {
    const t = copyDirToTemp(CORPUS, 'malformed');
    try {
      fs.writeFileSync(path.join(t.dir, 'rs-005.json'), '{ not json !!');
      const result = runCheck(['--corpus', t.dir, '--messy', MESSY, '--reviewers', REVIEWERS]);
      expect(result.exit).toBe(1);
    } finally {
      t.cleanup();
    }
  });

  it('rejects messy fixtures merged into the corpus directory', () => {
    const t = copyDirToTemp(CORPUS, 'merged');
    try {
      const messySource = fs.readdirSync(MESSY)[0];
      fs.copyFileSync(path.join(MESSY, messySource), path.join(t.dir, messySource));
      const result = runCheck(['--corpus', t.dir, '--messy', MESSY, '--reviewers', REVIEWERS]);
      expect(result.exit).toBe(1);
      expect(result.out).toContain('does not match rs');
    } finally {
      t.cleanup();
    }
  });
});
