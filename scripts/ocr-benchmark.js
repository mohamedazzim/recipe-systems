#!/usr/bin/env node
'use strict';
// ============================================================================
// scripts/ocr-benchmark.js — Q10 OCR provider benchmark harness (stdlib only)
//
// Purpose: deterministically evaluate an OCR provider's output against
// reference recipe-card text, per the canonical Q10 requirement:
//
//   Tech Stack §11: "The final OCR provider must be benchmarked against the
//   team's real recipe-card dataset, including handwriting, poor lighting,
//   multilingual/vernacular terms, and ambiguous ingredient names."
//   Tech Stack §25.5 / ADR §2 Decision 3: provider-neutral seam; OCR is
//   Intake-only. GCV = INITIAL CANDIDATE (not decided).
//
// STATUS 2026-09-09: harness LOGIC is verified by --self-test (deterministic
// mock). A REAL-card run is NOT possible yet: the D-04 corpus is synthetic
// JSON text (provenance.synthetic:true), no recipe-card images exist in the
// repo, and no provider credentials exist on this machine. The self-test
// result is harness verification ONLY — it is NOT a real-card benchmark
// result and must never be cited as one.
//
// CRITERION (proposed, NOT canonical — the sources define no numeric
// threshold; recorded in HANDOFF §5 2026-09-09):
//   - line preservation >= 95% per card (normalized whitespace/case/dash)
//   - zero dropped lines on lines marked critical in the manifest
//     (golden card: both fenugreek lines are critical)
//   - per-line confidence available; lines < 0.9 (or missing confidence)
//     must be detectable -> needs_review candidates (INV-04)
//   - latency recorded per image (suggested budget <10s, within the
//     canonical "photo -> first analysis < 2 min" P7 exit)
//
// Usage:
//   node scripts/ocr-benchmark.js --self-test          # verify metric logic
//   node scripts/ocr-benchmark.js --manifest m.json    # real run (blocked
//                                                      #   without images + creds)
//   OCR_BENCH_PROVIDER=mock|gcv   VISION_API_KEY=...   # provider selection
// ============================================================================

const fs = require('fs');
const https = require('https');

// ---------------------------------------------------------------------------
// Normalization — comparison tolerance, NOT silent error erasure. Every
// normalization is recorded in the report so real errors stay visible.
// ---------------------------------------------------------------------------
const UNICODE_FRACTIONS = { '\u00BD': '1/2', '\u00BC': '1/4', '\u00BE': '3/4' };

function normalizeLine(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-') // em/en dash -> hyphen
    .replace(/[\u00BD\u00BC\u00BE]/g, (m) => UNICODE_FRACTIONS[m] || m)
    .replace(/[.,;:!?'"]/g, '') // punctuation-insensitive, case-insensitive
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein distance (char-level error count) — used only as a REPORTED
// metric and for match pairing; never used to "repair" provider output.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[m][n];
}

function bestMatch(refNorm, ocrNorm) {
  let best = null;
  for (let i = 0; i < ocrNorm.length; i++) {
    const dist = levenshtein(refNorm, ocrNorm[i]);
    if (!best || dist < best.dist) best = { index: i, dist };
  }
  return best;
}

// ---------------------------------------------------------------------------
// evaluate() — the metric core. Pure function: same inputs -> same report.
// ---------------------------------------------------------------------------
function evaluate({ imageId, referenceLines, ocrLines, confidences, latencyMs, critical = [] }) {
  const refNorm = referenceLines.map(normalizeLine);
  const ocrNorm = ocrLines.map(normalizeLine);
  const used = new Set();
  const missing = [];
  let charErrors = 0;

  refNorm.forEach((r, i) => {
    const m = bestMatch(r, ocrNorm.filter((_, j) => !used.has(j)).map((o) => o));
    const candIndex = ocrNorm.findIndex((o, j) => !used.has(j) && m && levenshtein(r, o) === m.dist);
    // match tolerance: <= 2 chars OR <= 20% of reference length (proposed)
    const tol = Math.max(2, Math.floor(r.length * 0.2));
    if (candIndex >= 0 && m.dist <= tol) {
      used.add(candIndex);
      charErrors += m.dist;
    } else {
      missing.push(i);
    }
  });

  const confs = confidences || ocrLines.map(() => null);
  const confidenceAvailable = confs.length === ocrLines.length && confs.every((c) => typeof c === 'number');
  const lowConfidenceCount = ocrLines
    .filter((_, i) => typeof confs[i] !== 'number' || confs[i] < 0.9)
    .length;

  const criticalMissing = missing.filter((i) => critical.includes(i));
  const preservationRatio = referenceLines.length ? (referenceLines.length - missing.length) / referenceLines.length : 1;

  // Proposed criterion (see header): >=95% preserved AND zero critical drops.
  const pass = preservationRatio >= 0.95 && criticalMissing.length === 0;

  return {
    imageId,
    referenceCount: referenceLines.length,
    preservedCount: referenceLines.length - missing.length,
    missingReferenceLines: missing.map((i) => referenceLines[i]),
    criticalMissing: criticalMissing.map((i) => referenceLines[i]),
    preservationRatio: Number(preservationRatio.toFixed(4)),
    charErrors,
    confidenceAvailable,
    lowConfidenceCount,
    lowConfidenceDetectable: confidenceAvailable && confs.length === ocrLines.length,
    latencyMs: latencyMs ?? null,
    pass,
  };
}

// ---------------------------------------------------------------------------
// Providers. mock = deterministic (self-test only). gcv = UNTESTED — no
// credentials exist on this machine; kept OUTSIDE the repo per policy.
// ---------------------------------------------------------------------------
const MOCK_CASES = {
  // clean OCR with one low-confidence line and dash/case variation
  clean: {
    referenceLines: ['Fish — 500g', 'Drumstick — 1 Nos', 'Fenugreek Powder — 1/2 Tsp', 'Fenugreek — 1/4 Tsp'],
    critical: [2, 3], // both fenugreek lines are golden-card critical
    ocrLines: ['Fish - 500g', 'Drumstick 1 Nos', 'fenugreek powder - 1/2 Tsp', 'Fenugreek - 1/4 Tsp'],
    confidences: [0.99, 0.97, 0.45, 0.88],
    latencyMs: 812,
  },
  // provider DROPPED the second fenugreek line — must be caught
  dropped: {
    referenceLines: ['Fish — 500g', 'Drumstick — 1 Nos', 'Fenugreek Powder — 1/2 Tsp', 'Fenugreek — 1/4 Tsp'],
    critical: [2, 3],
    ocrLines: ['Fish - 500g', 'Drumstick 1 Nos', 'fenugreek powder - 1/2 Tsp'],
    confidences: [0.99, 0.97, 0.45],
    latencyMs: 700,
  },
  // provider returns NO confidence — must be flagged (Tech Stack §11: no
  // invented score; conservative review policy)
  noconf: {
    referenceLines: ['Fish — 500g', 'Drumstick — 1 Nos'],
    critical: [],
    ocrLines: ['Fish - 500g', 'Drumstick 1 Nos'],
    confidences: null,
    latencyMs: 900,
  },
};

function gcvProvider(imagePath) {
  // Google Cloud Vision REST v1, DOCUMENT_TEXT_DETECTION, API-key auth.
  // UNTESTED: this machine has no VISION_API_KEY and no real card images.
  const key = process.env.VISION_API_KEY;
  if (!key) {
    throw new Error('BLOCKED: VISION_API_KEY not set (GCV credentials live OUTSIDE the repo).');
  }  const imageBytes = fs.readFileSync(imagePath);
  const body = JSON.stringify({
    requests: [{ image: { content: imageBytes.toString('base64') }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'vision.googleapis.com', path: `/v1/images:annotate?key=${key}`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`GCV HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          const parsed = JSON.parse(data);
          const lines = [];
          const confidences = [];
          for (const block of parsed.responses?.[0]?.fullTextAnnotation?.pages?.[0]?.blocks || []) {
            for (const para of block.paragraphs || []) {
              const words = para.words || [];
              const text = words.map((w) => (w.symbols || []).map((s) => s.text).join('')).join(' ');
              if (!text.trim()) continue;
              const confs = words.map((w) => (typeof w.confidence === 'number' ? w.confidence : null));
              const conf = confs.every((c) => typeof c === 'number') ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
              lines.push(text);
              confidences.push(conf);
            }
          }
          resolve({ lines, confidences });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// PaddleOCR local serving (D-11 decision): POST base64 to OCR_PADDLE_ENDPOINT and
// normalize the vendor response (v2 [box,[text,conf]] / flattened [box,text,conf] /
// {rec_text,rec_score}) into the same {lines, confidences} contract every provider
// uses. No credentials; the endpoint is the local serving URL.
function paddleProvider(imagePath) {
  const endpoint = process.env.OCR_PADDLE_ENDPOINT || 'http://localhost:8866/predict/ocr_system';
  const imageBytes = fs.readFileSync(imagePath);
  const body = JSON.stringify({ images: [imageBytes.toString('base64')] });
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const mod = url.protocol === 'https:' ? require('https') : require('http');
    const req = mod.request(
      { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`PaddleOCR HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          const json = JSON.parse(data);
          let list = json?.result ?? json?.results?.[0] ?? json;
          if (Array.isArray(list) && list.length === 1 && Array.isArray(list[0]) && !isItem(list[0]) && isItem(list[0][0])) list = list[0];
          const lines = [];
          const confidences = [];
          for (const item of list || []) {
            if (Array.isArray(item)) {
              const second = item[1];
              if (Array.isArray(second) && typeof second[0] === 'string') { lines.push(second[0].trim()); confidences.push(typeof second[1] === 'number' ? second[1] : null); }
              else if (typeof second === 'string') { lines.push(second.trim()); confidences.push(typeof item[2] === 'number' ? item[2] : null); }
            } else if (item && typeof item === 'object') {
              const t = typeof item.rec_text === 'string' ? item.rec_text : item.text;
              if (typeof t === 'string' && t.trim()) { lines.push(t.trim()); confidences.push(typeof item.rec_score === 'number' ? item.rec_score : null); }
            }
          }
          resolve({ lines, confidences });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
function isItem(x) {
  return Array.isArray(x) && (Array.isArray(x[1]) ? typeof x[1][0] === 'string' : typeof x[1] === 'string');
}

// ---------------------------------------------------------------------------
// Golden-card stub benchmark (CI tier) — the adapter seam's deterministic stub,
// NOT a real-card result. Verifies the golden invariant lines (both fenugreeks
// distinct, no garlic, drumstick/mango/coconut present) and low-confidence
// flagging. The REAL-card benchmark still requires provenance-valid photos +
// manifest (Q10 OPEN).
// ---------------------------------------------------------------------------
const GOLDEN_CARD_REFERENCE = [
  'Fish - 500g', 'Drumstick - 1 Nos', 'Mango - 1/2 Nos', 'Grated Coconut - Half Shell',
  'Coconut Oil - For Tempering', 'Chilli - 5 Nos', 'Chilli Powder - 2 Tsp',
  'Coriander Powder - 1 Tsp', 'Tamarind - A Lemon Size', 'Fenugreek Powder - 1/2 Tsp',
  'Fenugreek - 1/4 Tsp',
];
const GOLDEN_CARD_CRITICAL = [9, 10]; // both fenugreek lines are golden-card critical

function runGoldenStub() {
  const stub = {
    lines: ['Fish - 500g', 'Drumstick - 1 Nos', 'Mango - 1/2 Nos', 'Grated Coconut - Half Shell',
      'Coconut Oil - For Tempering', 'Chilli - 5 Nos', 'Chilli Powder - 2 Tsp',
      'Coriander Powder - 1 Tsp', 'Tamarind - A Lemon Size', 'Fenugreek Powder - 1/2 Tsp',
      'Fenugreek - 1/4 Tsp'],
    confidences: [0.98, 0.96, 0.95, 0.94, 0.93, 0.92, 0.91, 0.9, 0.94, 0.45, 0.93],
  };
  const r = evaluate({ imageId: 'golden-card', referenceLines: GOLDEN_CARD_REFERENCE,
    ocrLines: stub.lines, confidences: stub.confidences, latencyMs: 0, critical: GOLDEN_CARD_CRITICAL });
  const hasGarlic = stub.lines.some((l) => /garlic/i.test(l));
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    provider: 'stub (golden-card-deterministic, CI tier — NOT a real-card result)',
    model: 'PP-OCRv4 (documented config)', version: 'paddleocr-3.x (documented config)',
    note: 'Real-card benchmark still blocked: no provenance-valid golden photo + manifest + local PaddleOCR runtime.',
    result: { ...r, garlicAbsent: !hasGarlic, bothFenugreeksDistinct: r.preservedCount >= 11 },
  }, null, 2));
  process.exit(r.pass && !hasGarlic ? 0 : 1);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function runSelfTest() {
  const expected = [
    { case: 'clean', preserved: 4, missing: 0, lowConfidence: 2, pass: true },
    { case: 'dropped', preserved: 3, missing: 1, pass: false },
    { case: 'noconf', confidenceAvailable: false, lowConfidence: 2, pass: true },
  ];
  let ok = true;
  for (const exp of expected) {
    const c = MOCK_CASES[exp.case];
    const r = evaluate({ imageId: exp.case, referenceLines: c.referenceLines, ocrLines: c.ocrLines,
      confidences: c.confidences, latencyMs: c.latencyMs, critical: c.critical });
    const checks = {
      preserved: exp.preserved === undefined || r.preservedCount === exp.preserved,
      missing: exp.missing === undefined || r.missingReferenceLines.length === exp.missing,
      lowConfidence: exp.lowConfidence === undefined || r.lowConfidenceCount === exp.lowConfidence,
      confidenceAvailable: exp.confidenceAvailable === undefined || r.confidenceAvailable === exp.confidenceAvailable,
      pass: r.pass === exp.pass,
    };
    const all = Object.values(checks).every(Boolean);
    ok = ok && all;
    console.log(`[${exp.case}] ${all ? 'PASS' : 'FAIL'}  preserved=${r.preservedCount}/${r.referenceCount} missing=${r.missingReferenceLines.length} lowConf=${r.lowConfidenceCount} charErrors=${r.charErrors} confAvail=${r.confidenceAvailable} pass=${r.pass} latency=${r.latencyMs}ms`);
  }
  console.log(ok ? 'SELF-TEST: PASS (harness metric logic verified on deterministic mock data — NOT a real-card result)' : 'SELF-TEST: FAIL');
  process.exit(ok ? 0 : 1);
}

async function runManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const provider = process.env.OCR_BENCH_PROVIDER || 'gcv';
  const missingImages = manifest.filter((m) => !fs.existsSync(m.image));
  if (missingImages.length) {
    console.log(`BLOCKED: ${missingImages.length}/${manifest.length} manifest images do not exist (first: ${missingImages[0].image}).`);
    console.log('The D-04 corpus is synthetic JSON text — real recipe-card photos have not been added to the repo. No benchmark run is possible.');
    process.exit(2);
  }
  if (provider === 'gcv' && !process.env.VISION_API_KEY) {
    console.log('BLOCKED: OCR_BENCH_PROVIDER=gcv requires VISION_API_KEY (credentials stay OUTSIDE the repo).');
    process.exit(2);
  }
  const results = [];
  for (const m of manifest) {
    const t0 = Date.now();
    const out = provider === 'mock'
      ? { lines: m.mock_lines, confidences: m.mock_confidences }
      : provider === 'paddle'
        ? await paddleProvider(m.image)
        : await gcvProvider(m.image);
    results.push(evaluate({ imageId: m.id, referenceLines: m.reference_lines, ocrLines: out.lines,
      confidences: out.confidences, latencyMs: Date.now() - t0, critical: m.critical || [] }));
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), provider, results }, null, 2));
}

const [, , cmd, arg] = process.argv;
if (cmd === '--self-test') runSelfTest();
else if (cmd === '--golden-stub') runGoldenStub();
else if (cmd === '--manifest' && arg) runManifest(arg);
else {
  console.log('Usage:\n  node scripts/ocr-benchmark.js --self-test\n  node scripts/ocr-benchmark.js --golden-stub\n  node scripts/ocr-benchmark.js --manifest <manifest.json>');
  process.exit(1);
}
