// D-29 (Track R): the reviewed reference-data import command (ADR §7).
//
//   ts-node import-cli.ts stage   <import-file.json>
//   ts-node import-cli.ts diff    <import-file.json>
//   ts-node import-cli.ts approve <import-file.json> --reviewer "Name" [--notes "..."]
//
// stage/diff never write. approve records the human sign-off in
// infra/reference-data/approvals/<import_id>.json and then persists through the
// ReferenceDataService (the module's sole write path). No public HTTP admin
// API exists — the canonical docs prescribe none (ADR §7 flow only).

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@recipe-systems/database';
import { ReferenceDataRepository } from '../reference-data.repository';
import { ReferenceDataService } from '../reference-data.service';
import { referenceDataImportSchema } from '../import.schema';

const REPO_ROOT = join(__dirname, '../../../../../');
const APPROVALS_DIR = join(REPO_ROOT, 'infra/reference-data/approvals');

function usage(): never {
  console.error('usage: import-cli.ts stage|diff|approve <import-file.json> [--reviewer NAME] [--notes "..."]');
  process.exit(2);
}

function loadFile(path: string): { raw: unknown; sha: string } {
  const text = readFileSync(path, 'utf8');
  const raw = JSON.parse(text);
  const file = referenceDataImportSchema.parse(raw); // validates before anything else
  const sha = createHash('sha256').update(JSON.stringify(file)).digest('hex');
  return { raw, sha };
}

async function main() {
  const [cmd, filePath] = process.argv.slice(2);
  if (!cmd || !filePath) usage();
  const reviewerIdx = process.argv.indexOf('--reviewer');
  const reviewer = reviewerIdx >= 0 ? process.argv[reviewerIdx + 1] : undefined;
  const notesIdx = process.argv.indexOf('--notes');
  const notes = notesIdx >= 0 ? process.argv[notesIdx + 1] : undefined;

  const prisma = new PrismaClient();
  const repo = new ReferenceDataRepository(prisma);
  const service = new ReferenceDataService(repo, APPROVALS_DIR);

  try {
    if (cmd === 'stage' || cmd === 'diff') {
      const { raw } = loadFile(filePath);
      const diff = await service.stage(raw);
      console.log(JSON.stringify(diff, null, 2));
      console.log(`\n${cmd.toUpperCase()} COMPLETE — nothing was written. Review the diff, then approve.`);
      return;
    }

    if (cmd === 'approve') {
      if (!reviewer) {
        console.error('approve requires --reviewer "Name" (the human sign-off)');
        process.exit(2);
      }
      const { raw, sha } = loadFile(filePath);
      const file = referenceDataImportSchema.parse(raw);
      const importId = file.import_id;

      // 1. record the human approval (sign-off) FIRST
      mkdirSync(APPROVALS_DIR, { recursive: true });
      const record = {
        import_id: importId,
        reviewer,
        reviewed_at: new Date().toISOString(),
        import_file_sha256: sha,
        review_notes: notes,
      };
      const approvalPath = join(APPROVALS_DIR, `${importId}.json`);
      if (existsSync(approvalPath)) {
        const existing = JSON.parse(readFileSync(approvalPath, 'utf8'));
        // re-approving the SAME signed content is allowed (e.g. re-applying
        // after a dev-database reset) — different content requires a new
        // sign-off (delete the old record and re-approve deliberately)
        if (existing.import_file_sha256 !== sha || existing.reviewer !== reviewer) {
          console.error(`approval already recorded at ${approvalPath} for different content/reviewer — review and re-approve deliberately`);
          process.exit(1);
        }
        console.log(`re-applying already-approved import ${importId} (same signed content, same reviewer)`);
      } else {
        writeFileSync(approvalPath, JSON.stringify(record, null, 2) + '\n');
      }

      // 2. persist through the reviewed path
      try {
        const result = await service.approve(importId, reviewer, raw);
        console.log(JSON.stringify(result, null, 2));
        console.log(`APPROVED: ${importId} by ${reviewer} — effective-dated versions persisted`);
      } catch (err) {
        // the sign-off is only meaningful if the persist succeeded — retract
        // the record so the human can fix the import and re-approve
        try { rmSync(approvalPath, { force: true }); } catch { /* best effort */ }
        throw err;
      }
      return;
    }

    usage();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('reference-data import failed:', err);
  process.exit(1);
});
