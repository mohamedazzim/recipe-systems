// Golden fixture tests (G1 / D-03 / ERD §16) — prove every one of the 8
// invariants is executable: canonical fixture passes all; a single controlled
// violation per invariant makes exactly that invariant fire; restoration
// passes again. This suite also arms the regression-gates
// "golden-test-present" gate (references the fixture by name) and runs in the
// integration stage of verify-local.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CHECKS, runChecks, parseAssertionsYaml } = require('../../scripts/golden-check.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURE_PATH = path.join(ROOT, 'tests', 'fixtures', 'golden_kanyakumari_card.json');
const ASSERTIONS_PATH = path.join(ROOT, 'tests', 'assertions', 'golden_recipe_assertions.yaml');

function loadFixture(): any {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

function clone(fixture: any): any {
  return JSON.parse(JSON.stringify(fixture));
}

// One surgical violation per invariant. Each mutation targets ONLY its check.
const VIOLATIONS: Record<string, (fx: any) => void> = {
  both_fenugreeks: (fx) => {
    fx.card.lines = fx.card.lines.filter((l: string) => !l.includes('Fenugreek —'));
  },
  no_ginger_garlic: (fx) => {
    fx.card.lines.push('Garlic — 2 Cloves');
  },
  family_not_generic: (fx) => {
    fx.expected.family.name = 'generic Indian curry';
  },
  coriander_blind_spot: (fx) => {
    fx.expected.view_2.coriander_blind_spot_note = 'No blind spots recorded.';
  },
  station_card_inferred: (fx) => {
    fx.expected.station_card.present = false;
  },
  view8_no_safe: (fx) => {
    fx.expected.view_8.includes.push('This dish is safe for everyone.');
  },
  view9_band: (fx) => {
    fx.expected.view_9.energy_kcal = 1750; // point value, not a band
  },
  sodium_unknown: (fx) => {
    fx.expected.view_9.sodium = '1,200 mg';
  },
};

describe('D-03 golden fixture scaffold', () => {
  it('the assertions YAML declares exactly the 8 implemented invariants (no unencoded, no extras)', () => {
    const declared = parseAssertionsYaml(fs.readFileSync(ASSERTIONS_PATH, 'utf8'));
    const ids = CHECKS.map((c) => c.id);
    expect(Object.keys(declared).sort()).toEqual(ids.sort());
    expect(Object.keys(declared)).toHaveLength(8);
  });

  it('canonical fixture passes all 8 invariants', () => {
    const results = runChecks(loadFixture());
    expect(results).toHaveLength(8);
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
  });

  it.each(Object.keys(VIOLATIONS))('violating %s fires exactly that invariant, and only that one', (id) => {
    const violated = clone(loadFixture());
    VIOLATIONS[id](violated);
    const results = runChecks(violated);
    const byId = new Map(results.map((r: any) => [r.id, r]));
    // Targeted check must fail with an understandable detail.
    const targeted = byId.get(id) as any;
    expect(targeted.ok).toBe(false);
    expect(targeted.detail).toBeTruthy();
    // Every OTHER check must stay green — independence, not trivially-true checks.
    for (const r of results as any[]) {
      if (r.id !== id) {
        expect(r.ok).toBe(true);
      }
    }
    // Restoration: canonical fixture passes again.
    const restored = runChecks(loadFixture());
    expect(restored.every((r: any) => r.ok)).toBe(true);
  });
});
