#!/usr/bin/env node
// Golden invariant validator (D-03 / ERD §16) — CI-blocking.
//
// Loads tests/fixtures/golden_kanyakumari_card.json + the 8 assertions in
// tests/assertions/golden_recipe_assertions.yaml and evaluates every invariant
// as an executable check. Exit 0 only when all 8 pass. Each check is
// independently violable (see tests/integration/golden_fixture.test.ts, which
// plants one controlled violation per invariant and proves it fires).
//
// Analysis-output fields assert against the fixture's `expected` block: real
// analysis payloads arrive at D-16/D-18 and will REPLACE this expectation
// wiring, not the invariant definitions (DISPATCH D-03: the scaffold is the
// deliverable; assertions fail cleanly rather than silently pass).

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'golden_kanyakumari_card.json');
const DEFAULT_ASSERTIONS = path.join(ROOT, 'tests', 'assertions', 'golden_recipe_assertions.yaml');

function fail(msg) {
  console.error(`[golden:FIRE] ${msg}`);
}

/**
 * Minimal flat-YAML subset parser for the assertions file
 * (sections + "key: value" lines + comments/blank lines).
 */
function parseAssertionsYaml(text) {
  const invariants = {};
  let inSection = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line === 'invariants:') {
      inSection = true;
      continue;
    }
    if (inSection && line.includes(':')) {
      const idx = line.indexOf(':');
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) invariants[key] = value;
    }
  }
  return invariants;
}

// --- the 8 executable checks (each reads the fixture, returns {ok, detail}) ---

const CHECKS = [
  {
    id: 'both_fenugreeks',
    label: 'Both fenugreek lines remain and stay distinct',
    check(fx) {
      const lines = fx.card.lines.map((l) => l.toLowerCase());
      const fenugreekLines = lines.filter((l) => l.includes('fenugreek'));
      const powder = fenugreekLines.some((l) => l.includes('fenugreek powder'));
      const seeds = fenugreekLines.some((l) => /fenugreek\s*—/.test(l) && !l.includes('powder'));
      const detail = `fenugreek lines found: ${fenugreekLines.length} (powder=${powder}, seeds=${seeds})`;
      if (fenugreekLines.length >= 2 && powder && seeds) return { ok: true, detail };
      return { ok: false, detail };
    },
  },
  {
    id: 'no_ginger_garlic',
    label: 'No ginger / no garlic invented; garlic recorded absent',
    check(fx) {
      const lines = fx.card.lines.map((l) => l.toLowerCase());
      const found = lines.filter((l) => l.includes('garlic') || l.includes('ginger'));
      const absent = (fx.expected.absent || []).map((a) => a.toLowerCase());
      const detail = `card garlic/ginger lines: ${found.length}; expected.absent=${absent.join(',')}`;
      if (found.length === 0 && absent.includes('garlic') && absent.includes('ginger')) {
        return { ok: true, detail };
      }
      return { ok: false, detail };
    },
  },
  {
    id: 'family_not_generic',
    label: 'Family is not "generic Indian curry"',
    check(fx) {
      const family = fx.expected.family || {};
      const name = String(family.name || '').trim();
      const region = String(family.region || '').trim();
      const generic = /generic\s*(indian\s*)?curry/i.test(name);
      const detail = `family=${name || '<empty>'} region=${region || '<empty>'} generic=${generic}`;
      if (name && /tamil/i.test(name) && region && !generic) return { ok: true, detail };
      return { ok: false, detail };
    },
  },
  {
    id: 'coriander_blind_spot',
    label: 'View 2 records the coriander under-reporting blind spot',
    check(fx) {
      const note = String((fx.expected.view_2 || {}).coriander_blind_spot_note || '').trim();
      const detail = `note=${note ? note.slice(0, 60) + '…' : '<empty>'}`;
      if (note && /coriander/i.test(note) && /split/i.test(note)) return { ok: true, detail };
      return { ok: false, detail };
    },
  },
  {
    id: 'station_card_inferred',
    label: 'Station card appears when the inferred method is accepted',
    check(fx) {
      const tag = String((fx.method || {}).matched_family_method?.tag || '').toUpperCase();
      const sc = fx.expected.station_card || {};
      const includes = (sc.includes || []).join(' | ');
      const detail = `method tag=${tag || '<none>'} present=${!!sc.present} includes=${includes.slice(0, 60)}`;
      const ok =
        tag === 'INFERRED' &&
        sc.present === true &&
        sc.requires_inferred_method === true &&
        Array.isArray(sc.includes) &&
        sc.includes.length > 0 &&
        sc.includes.some((s) => /untasted briefing/i.test(String(s)));
      return { ok, detail };
    },
  },
  {
    id: 'view8_no_safe',
    label: 'View 8 never uses the word "safe"',
    check(fx) {
      const text = (fx.expected.view_8?.includes || []).join(' ');
      const used = /\bsafe\b/i.test(text);
      const detail = `view_8 text contains "safe": ${used}`;
      if (!used && text.length > 0) return { ok: true, detail };
      return { ok: false, detail };
    },
  },
  {
    id: 'view9_band',
    label: 'View 9 energy is a band, never a point value',
    check(fx) {
      const kcal = fx.expected.view_9?.energy_kcal;
      const isBand =
        kcal &&
        typeof kcal === 'object' &&
        typeof kcal.min === 'number' &&
        typeof kcal.max === 'number' &&
        kcal.min > 0 &&
        kcal.min < kcal.max;
      const detail = `energy_kcal=${JSON.stringify(kcal)}`;
      if (isBand) return { ok: true, detail };
      return { ok: false, detail };
    },
  },
  {
    id: 'sodium_unknown',
    label: 'View 9 sodium is Unknown where the card does not specify it',
    check(fx) {
      const sodium = fx.expected.view_9?.sodium;
      const detail = `sodium=${JSON.stringify(sodium)}`;
      if (typeof sodium === 'string' && sodium.toLowerCase() === 'unknown') return { ok: true, detail };
      return { ok: false, detail };
    },
  },
];

function runChecks(fixture) {
  return CHECKS.map((c) => {
    try {
      const result = c.check(fixture);
      return { id: c.id, label: c.label, ...result };
    } catch (err) {
      return { id: c.id, label: c.label, ok: false, detail: `check threw: ${err.message}` };
    }
  });
}

function main() {
  const fixturePath = process.argv[2] || DEFAULT_FIXTURE;
  if (!fs.existsSync(fixturePath)) {
    fail(`fixture not found: ${fixturePath}`);
    process.exit(1);
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const yamlText = fs.readFileSync(DEFAULT_ASSERTIONS, 'utf8');
  const declared = parseAssertionsYaml(yamlText);
  const implemented = CHECKS.map((c) => c.id);

  // Completeness both ways: every declared invariant implemented, no extras.
  const missing = Object.keys(declared).filter((id) => !implemented.includes(id));
  const extra = implemented.filter((id) => !(id in declared));
  if (missing.length || extra.length) {
    fail(`assertion-implementation mismatch: missing=[${missing}] extra=[${extra}]`);
    process.exit(1);
  }
  if (Object.keys(declared).length !== 8) {
    fail(`expected exactly 8 invariants in the assertions file, found ${Object.keys(declared).length}`);
    process.exit(1);
  }

  const results = runChecks(fixture);
  let failedCount = 0;
  for (const r of results) {
    const marker = r.ok ? 'PASS' : 'FAIL';
    if (!r.ok) failedCount += 1;
    console.log(`  [${marker}] ${r.id} — ${r.label} (${r.detail})`);
  }
  console.log(
    `golden-check: ${results.length - failedCount}/${results.length} invariants pass (fixture: ${path.basename(fixturePath)})`,
  );
  if (failedCount > 0) process.exit(1);
}

module.exports = { CHECKS, runChecks, parseAssertionsYaml, DEFAULT_FIXTURE };

if (require.main === module) {
  main();
}
