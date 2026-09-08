// OpenAPI generation from @recipe-systems/schemas (SCAFFOLD §6 conventions; D-05 freeze).
//
// Until D-05 freezes the nine-view JSON schemas, packages/schemas deliberately exports no
// contracts (BUILD_PLAN P0-5: "Contracts before generators"). This script therefore emits
// nothing and exits 0 — the CI contract step is a documented no-op, never a failing stub.
// After D-05, this script renders the frozen zod schemas into openapi/openapi.json.
import fs from 'fs';
import path from 'path';
import { NINE_VIEW_SCHEMAS_FROZEN_AT } from '@recipe-systems/schemas';

async function main(): Promise<void> {
  const frozen = NINE_VIEW_SCHEMAS_FROZEN_AT;
  if (frozen) {
    // __dirname = <repo>/apps/api/scripts → 3 ups = repo root.
    const target = path.resolve(__dirname, '../../../openapi/openapi.json');
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Recipe Systems API', version: '0.2.0' },
      paths: {},
      'x-contracts-frozen-at': frozen,
    };
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(doc, null, 2) + '\n');
    console.log(`openapi/openapi.json written (contracts frozen at ${frozen})`);
  } else {
    console.log('contracts:generate — SKIPPED: nine-view schemas not frozen yet (D-05).');
  }
}

void main();
