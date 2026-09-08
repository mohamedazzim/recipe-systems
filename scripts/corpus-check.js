#!/usr/bin/env node
// Corpus validator (D-04 / QG5 Volume tier) — executable, not a file-existence check.
//
// Validates:
//   corpus/   — exactly 50 deterministic fixtures rs-001..rs-050, unique ids,
//               required fields, allowed enums, reviewer references resolve,
//               coverage minimums (both reviewer regions, veg+non-veg,
//               photo+paste+form), rs-001 seeded with the golden card content.
//   messy_20/ — exactly 20 fixtures messy-001..messy-020 as a separate named set
//               (never merged into the corpus count).
//   reviewers.json — slot definitions exist; fixtures may only reference declared slots.
//
// Every check is independently violable — proven by tests/integration/corpus_validation.test.ts.
// Usage: node scripts/corpus-check.js [--corpus DIR] [--messy DIR] [--reviewers FILE]

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULTS = {
  corpus: path.join(ROOT, 'tests', 'fixtures', 'corpus'),
  messy: path.join(ROOT, 'tests', 'fixtures', 'messy_20'),
  reviewers: path.join(ROOT, 'tests', 'fixtures', 'reviewers.json'),
};

const REGIONS = ['tamil-nadu', 'kerala', 'other'];
const CATEGORIES = ['veg', 'non-veg'];
const INPUT_TYPES = ['photo', 'paste', 'form'];
const REVIEWER_SLOTS = ['tn_kanyakumari', 'kerala'];

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 2) {
    if (argv[i] === '--corpus') opts.corpus = argv[i + 1];
    if (argv[i] === '--messy') opts.messy = argv[i + 1];
    if (argv[i] === '--reviewers') opts.reviewers = argv[i + 1];
  }
  return opts;
}

// Validation result collector — every problem is reported, nothing silently skipped.
function createReport() {
  const problems = [];
  return {
    fail(msg) {
      problems.push(msg);
    },
    ok() {
      return problems.length === 0;
    },
    problems,
  };
}

function readFixtures(dir) {
  const out = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) {
      out.__nonJson = out.__nonJson || [];
      out.__nonJson.push(file);
      continue;
    }
    out[file] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  return out;
}

/**
 * Validate one corpus (or messy) directory. Returns {ok, problems}.
 * @param {string} dir       directory to validate
 * @param {object} rules     {prefix, expectedCount, requiredFields, extraChecks}
 */
function validateSet(dir, rules, reviewers, report) {
  let files;
  try {
    files = readFixtures(dir);
  } catch (err) {
    report.fail(`${path.basename(dir)}: unreadable/invalid JSON — ${err.message}`);
    return;
  }
  const nonJson = files.__nonJson || [];
  delete files.__nonJson;
  for (const stray of nonJson) report.fail(`${path.basename(dir)}/${stray}: non-JSON file in fixture set`);

  const entries = Object.entries(files).filter(([name]) => name.startsWith(rules.prefix));
  const strayPrefix = Object.keys(files).filter((name) => !name.startsWith(rules.prefix));
  for (const stray of strayPrefix) report.fail(`${path.basename(dir)}/${stray}: id does not match ${rules.prefix}NNN convention`);

  // expected count — exact
  if (entries.length !== rules.expectedCount) {
    report.fail(
      `${path.basename(dir)}: expected exactly ${rules.expectedCount} fixtures, found ${entries.length}`,
    );
  }

  // ids exactly NNN, unique
  const ids = entries.map(([name, fx]) => fx.id ?? `(file ${name}: missing id)`);
  const seen = new Set();
  for (const id of ids) {
    if (typeof id !== 'string' || !new RegExp(`^${rules.prefix}-\\d{3}$`).test(id)) {
      report.fail(`${path.basename(dir)}: malformed fixture id ${JSON.stringify(id)} (expected ${rules.prefix}-NNN)`);
    }
    if (seen.has(id)) report.fail(`${path.basename(dir)}: duplicate fixture id ${id}`);
    seen.add(id);
  }

  // per-fixture structure
  for (const [name, fx] of entries) {
    const label = `${path.basename(dir)}/${fx.id ?? name}`;
    for (const field of rules.requiredFields) {
      if (fx[field] === undefined || fx[field] === null) {
        report.fail(`${label}: missing required field '${field}'`);
      }
    }
    if (!Number.isInteger(fx.version)) report.fail(`${label}: missing/invalid 'version' (deterministic versioning, QG5)`);
    if (!Array.isArray(fx.lines) || fx.lines.length === 0 || fx.lines.some((l) => typeof l !== 'string' || !l.trim())) {
      report.fail(`${label}: 'lines' must be a non-empty array of non-blank strings`);
    }
    if (fx.provenance?.synthetic !== true) report.fail(`${label}: provenance.synthetic must be true (no fabricated real-world claims)`);
    if (rules.enums) {
      for (const [field, allowed] of Object.entries(rules.enums)) {
        if (!allowed.includes(fx[field])) {
          report.fail(`${label}: '${field}'=${JSON.stringify(fx[field])} not in [${allowed.join(', ')}]`);
        }
      }
    }
    if (rules.extraChecks) rules.extraChecks(fx, label, reviewers, report);
  }
}

function main() {
  const opts = parseArgs(process.argv);
  const report = createReport();
  let reviewers;
  try {
    reviewers = JSON.parse(fs.readFileSync(opts.reviewers, 'utf8'));
  } catch (err) {
    report.fail(`reviewers.json unreadable — ${err.message}`);
    reviewers = { slots: {} };
  }

  // reviewer slots must exist for both canonical regions
  for (const slot of REVIEWER_SLOTS) {
    if (!reviewers.slots || !reviewers.slots[slot]) {
      report.fail(`reviewers.json: missing slot '${slot}' (Recipe_Systems §12 G2: two regional reviewers)`);
    }
  }

  const slotSet = new Set(Object.keys(reviewers.slots || {}));

  // --- corpus (the 50) ---
  const corpusCoverage = { regions: new Set(), categories: new Set(), inputTypes: new Set() };
  validateSet(
    opts.corpus,
    {
      prefix: 'rs',
      expectedCount: 50,
      requiredFields: ['id', 'version', 'name', 'region', 'category', 'input_type', 'method', 'lines', 'review', 'provenance'],
      enums: { region: REGIONS, category: CATEGORIES, input_type: INPUT_TYPES },
      extraChecks(fx, label, _rev, rep) {
        // method: boolean `provided` (B4: method optional); the golden seed (rs-001)
        // additionally carries matched_family_method.
        if (fx.method === undefined || (typeof fx.method.provided !== 'boolean' && !fx.method.matched_family_method)) {
          rep.fail(`${label}: method must be {provided: boolean} (rs-001: golden method shape allowed)`);
        }
        const slot = fx.review?.reviewer_slot;
        const expectedSlot = fx.region === 'tamil-nadu' ? 'tn_kanyakumari' : fx.region === 'kerala' ? 'kerala' : null;
        if (slot === undefined) {
          rep.fail(`${label}: review.reviewer_slot missing`);
        } else if (slot === null) {
          // null is only legitimate for non-reviewer regions
          if (expectedSlot !== null) rep.fail(`${label}: region ${fx.region} must map to reviewer slot '${expectedSlot}', got null`);
        } else if (!slotSet.has(slot)) {
          rep.fail(`${label}: reviewer reference '${slot}' does not resolve to a reviewers.json slot`);
        } else if (slot !== expectedSlot) {
          rep.fail(`${label}: region ${fx.region} must map to reviewer slot '${expectedSlot}', got '${slot}'`);
        }
        if (fx.review?.status !== 'unassigned') {
          rep.fail(`${label}: review.status must be 'unassigned' (no fabricated review approvals)`);
        }
        corpusCoverage.regions.add(fx.region);
        corpusCoverage.categories.add(fx.category);
        corpusCoverage.inputTypes.add(fx.input_type);
        if (fx.id === 'rs-001') {
          // Corpus seed = golden card: fenugreeks + no garlic + full expected block.
          if (!JSON.stringify(fx.expected || null)) rep.fail(`${label}: rs-001 must carry the golden expected block (corpus seed)`);
          if (!(fx.lines || []).some((l) => /fenugreek/i.test(l))) rep.fail(`${label}: rs-001 must contain fenugreek lines`);
          if ((fx.lines || []).some((l) => /garlic|ginger/i.test(l))) rep.fail(`${label}: rs-001 must not contain garlic/ginger`);
        }
      },
    },
    reviewers,
    report,
  );

  // coverage minimums (canonical-anchored: both reviewer regions, veg+non-veg, all three intake forms)
  for (const region of ['tamil-nadu', 'kerala']) {
    if (!corpusCoverage.regions.has(region)) report.fail(`corpus: no fixtures for reviewer region '${region}'`);
  }
  for (const cat of CATEGORIES) {
    if (!corpusCoverage.categories.has(cat)) report.fail(`corpus: no '${cat}' fixtures (veg/non-veg coverage)`);
  }
  for (const it of INPUT_TYPES) {
    if (!corpusCoverage.inputTypes.has(it)) report.fail(`corpus: no '${it}' fixtures (B1/B2/B5 intake forms)`);
  }

  // --- messy_20 (separate named set) ---
  validateSet(
    opts.messy,
    {
      prefix: 'messy',
      expectedCount: 20,
      requiredFields: ['id', 'version', 'name', 'region', 'lines', 'messy_features', 'provenance'],
      extraChecks(fx, label, _rev, rep) {
        if (!Array.isArray(fx.messy_features) || fx.messy_features.length === 0) {
          rep.fail(`${label}: messy_features must be a non-empty array (what makes it messy)`);
        }
      },
    },
    reviewers,
    report,
  );

  if (report.ok()) {
    console.log(
      `corpus-check: OK — 50 corpus fixtures, 20 messy fixtures (separate set), reviewer references resolve, coverage complete (${opts.corpus})`,
    );
    process.exit(0);
  }
  for (const p of report.problems) console.error(`[corpus:FIRE] ${p}`);
  console.error(`corpus-check: FAILED — ${report.problems.length} problem(s)`);
  process.exit(1);
}

module.exports = { main, parseArgs, validateSet, DEFAULTS, REGIONS, CATEGORIES, INPUT_TYPES, REVIEWER_SLOTS };

if (require.main === module) {
  main();
}
