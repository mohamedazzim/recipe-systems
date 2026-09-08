#!/usr/bin/env node
// QG3 — perf-baselines schema check (TEST_PLAN §2).
// No-op while `.perf-baselines.json` has an empty `baselines` object; a malformed file is a failure.
'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '.perf-baselines.json');
let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.error(`[perf] FAIL: ${file} missing — QG3 requires it at the repo root`);
  process.exit(1);
}
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error(`[perf] FAIL: ${file} is not valid JSON`);
  process.exit(1);
}
if (typeof data !== 'object' || data === null || typeof data.baselines !== 'object' || data.baselines === null) {
  console.error('[perf] FAIL: expected {"schema_version":1,"baselines":{...}}');
  process.exit(1);
}
const entries = Object.entries(data.baselines);
for (const [metric, rec] of entries) {
  if (typeof rec !== 'object' || rec === null || typeof rec.value !== 'number' || typeof rec.unit !== 'string') {
    console.error(`[perf] FAIL: baseline "${metric}" must be {value: number, unit: string, recorded_at?: string}`);
    process.exit(1);
  }
}
console.log(`[perf] OK: ${entries.length} baseline(s) recorded (no-op while empty)`);
