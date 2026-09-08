#!/usr/bin/env bash
# Contract check (D-05 target state: shared zod schemas → generated OpenAPI, checked in).
#
# Before D-05 freezes the nine-view schemas, packages/schemas deliberately exports no
# contracts (BUILD_PLAN P0-5: "Contracts before generators"). This script MUST NOT fail
# merely because the generated artifact does not exist yet — a failing placeholder is
# exactly the trap the pre-reconciliation pipeline had. Until D-05, this is a documented
# no-op; after D-05, `openapi/openapi.json` exists and this script diffs it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

(cd apps/api && npx tsx scripts/generate-openapi.ts)

if [ -f openapi/openapi.json ]; then
  echo "contract:check — openapi/openapi.json present (D-05 frozen). Regenerating to verify no drift…"
  BEFORE="$(cat openapi/openapi.json)"
  (cd apps/api && npx tsx scripts/generate-openapi.ts)
  AFTER="$(cat openapi/openapi.json)"
  if [ "$BEFORE" != "$AFTER" ]; then
    echo "contract:check ERROR — openapi/openapi.json drifted from packages/schemas. Regenerate."
    exit 1
  fi
  echo "contract:check OK — generated artifact matches packages/schemas."
else
  echo "contract:check — SKIPPED (documented no-op): the nine-view schemas freeze at D-05."
  echo "                packages/schemas exports no contracts yet; nothing to generate or diff."
fi
