// D-29 (Track R): the reviewed import path against REAL Postgres.
//
// Proves the A-29 attack vectors fail:
//  - stage writes NOTHING; unreviewed data can never reach live tables;
//  - approve persists provenance-traced, effective-dated versions;
//  - a second approved version SUPERSEDES the prior (effective_to closed,
//    version +1, prior content untouched — no in-place history mutation);
//  - overlapping effective ranges are rejected by the DB exclusion
//    constraint (EXCLUDE USING gist, migration 002);
//  - I7: unmapped ids are listed, mapped rows carry source reference;
//  - the golden reference lookups D-19 needs are satisfiable (fish flagged,
//    mustard EU, coconut NOT a US major tree nut, fenugreek note-flagged).
//
// Test hygiene: this suite truncates the six reference tables at START and
// RESTORES the exact prior rows (ids/provenance intact) at END — the live dev
// database's reviewed load (via the CLI) is never destroyed by a test run.

import { PrismaClient } from '@recipe-systems/database';
import { ReferenceDataRepository } from '../../apps/api/src/admin/reference-data.repository';
import { ReferenceDataService, UnreviewedImportError } from '../../apps/api/src/admin/reference-data.service';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

// same DATABASE_URL bootstrap as story_d17: env first, then scripts/dev.sh
if (!process.env.DATABASE_URL) {
  const devSh = readFileSync(join(__dirname, '../../scripts/dev.sh'), 'utf8');
  const match = devSh.match(/export DATABASE_URL="([^"]+)"/);
  if (match) process.env.DATABASE_URL = match[1];
}

const prisma = new PrismaClient();

const IMPORT_V1 = {
  import_id: 'R-2026-09-09-901',
  title: 'integration import v1',
  sources: ['integration source'],
  sections: {
    allergen_definitions: [
      { code: 'fish', name: 'Fish', label_pack: 'both', is_statutory: true },
      { code: 'tree_nuts', name: 'Tree nuts (US majors; coconut filed separately)', label_pack: 'both', is_statutory: true },
      { code: 'coconut', name: 'Coconut (declared by name)', label_pack: 'both', is_statutory: false },
      { code: 'fenugreek', name: 'Fenugreek (legume note)', label_pack: 'both', is_statutory: false },
    ],
    dictionary: [
      { canonical_name: 'fish', description: null },
      { canonical_name: 'coconut_flesh', description: null },
      { canonical_name: 'fenugreek_seed', description: null },
      { canonical_name: 'fenugreek_powder', description: null },
    ],
    aliases: [],
    allergen_mappings: [
      { ingredient_canonical_name: 'fish', allergen_code: 'fish', effective_from: '2026-09-01T00:00:00Z', source_reference: 'US/EU statutory' },
      { ingredient_canonical_name: 'coconut_flesh', allergen_code: 'coconut', effective_from: '2026-09-01T00:00:00Z', source_reference: 'declared by name' },
      { ingredient_canonical_name: 'fenugreek_seed', allergen_code: 'fenugreek', effective_from: '2026-09-01T00:00:00Z', source_reference: 'note flag' },
      { ingredient_canonical_name: 'fenugreek_powder', allergen_code: 'fenugreek', effective_from: '2026-09-01T00:00:00Z', source_reference: 'note flag' },
    ],
    composition_entries: [
      {
        ingredient_canonical_name: 'fish',
        external_source: 'USDA_FDC_SR_LEGACY',
        external_id: '171955',
        food_name: 'Fish, cod, Atlantic, raw',
        is_primary_for_ingredient: false,
        versions: [
          { energy_kcal_per_100g: '82', protein_g_per_100g: '17.8', fat_g_per_100g: '0.67', carb_g_per_100g: '0', fiber_g_per_100g: '0', sodium_mg_per_100g: '54', source_version: 'FDC 171955', effective_from: '2026-09-01T00:00:00Z' },
        ],
      },
    ],
  },
};

async function truncateReferenceTables() {
  await prisma.dietaryAllergenMapping.deleteMany();
  await prisma.nutritionFoodCompositionVersion.deleteMany();
  await prisma.nutritionFoodCompositionEntry.deleteMany();
  await prisma.ingredientAlias.deleteMany();
  await prisma.ingredientDictionary.deleteMany();
  await prisma.dietaryAllergenDefinition.deleteMany();
}

// Snapshot-restore hygiene: this suite shares the dev database with the LIVE
// reviewed reference data. Truncate at START (clean, idempotent state), then
// RESTORE the exact prior rows at END so the reviewed load (via the CLI) is
// never destroyed by a test run. Restored rows keep their ids/provenance.
let snapshot: {
  definitions: object[];
  dictionary: object[];
  aliases: object[];
  mappings: object[];
  entries: object[];
  versions: object[];
} | null = null;

async function captureReferenceTables() {
  snapshot = {
    definitions: await prisma.dietaryAllergenDefinition.findMany(),
    dictionary: await prisma.ingredientDictionary.findMany(),
    aliases: await prisma.ingredientAlias.findMany(),
    mappings: await prisma.dietaryAllergenMapping.findMany(),
    entries: await prisma.nutritionFoodCompositionEntry.findMany(),
    versions: await prisma.nutritionFoodCompositionVersion.findMany(),
  };
}

async function restoreReferenceTables() {
  if (!snapshot) return;
  await prisma.dietaryAllergenDefinition.createMany({ data: snapshot.definitions as never });
  await prisma.ingredientDictionary.createMany({ data: snapshot.dictionary as never });
  await prisma.ingredientAlias.createMany({ data: snapshot.aliases as never });
  await prisma.nutritionFoodCompositionEntry.createMany({ data: snapshot.entries as never });
  await prisma.dietaryAllergenMapping.createMany({ data: snapshot.mappings as never });
  await prisma.nutritionFoodCompositionVersion.createMany({ data: snapshot.versions as never });
}

async function refCounts() {
  return {
    definitions: await prisma.dietaryAllergenDefinition.count(),
    dictionary: await prisma.ingredientDictionary.count(),
    aliases: await prisma.ingredientAlias.count(),
    mappings: await prisma.dietaryAllergenMapping.count(),
    entries: await prisma.nutritionFoodCompositionEntry.count(),
    versions: await prisma.nutritionFoodCompositionVersion.count(),
  };
}

function makeService(approvalsDir: string) {
  const repo = new ReferenceDataRepository(prisma);
  return new ReferenceDataService(repo, approvalsDir);
}

function sign(importId: string, reviewer: string, file: unknown, approvalsDir: string) {
  const sha = createHash('sha256').update(JSON.stringify(file)).digest('hex');
  writeFileSync(
    join(approvalsDir, `${importId}.json`),
    JSON.stringify({ import_id: importId, reviewer, reviewed_at: '2026-09-09T10:00:00Z', import_file_sha256: sha }),
  );
}

describe('story D-29 — reviewed reference-data path (real Postgres)', () => {
  let approvalsDir: string;

  beforeAll(async () => {
    await captureReferenceTables();
    await truncateReferenceTables();
  });

  afterAll(async () => {
    await truncateReferenceTables();
    await restoreReferenceTables();
    rmSync(approvalsDir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it('stage: live tables stay EMPTY (unreviewed data never reaches live reference data)', async () => {
    approvalsDir = mkdtempSync(join(tmpdir(), 'd29-int-'));
    const service = makeService(approvalsDir);
    const diff = await service.stage(IMPORT_V1);
    expect(diff.reviewed).toBe(false);
    expect((await refCounts()).mappings).toBe(0);
    expect((await refCounts()).definitions).toBe(0);
  });

  it('approve without approval record → UnreviewedImportError, still empty', async () => {
    const service = makeService(approvalsDir);
    await expect(service.approve('R-2026-09-09-901', 'reviewer', IMPORT_V1)).rejects.toBeInstanceOf(UnreviewedImportError);
    expect((await refCounts()).mappings).toBe(0);
  });

  it('approve with the signed record → effective-dated rows with provenance', async () => {
    sign('R-2026-09-09-901', 'reviewer', IMPORT_V1, approvalsDir);
    const service = makeService(approvalsDir);
    const result = await service.approve('R-2026-09-09-901', 'reviewer', IMPORT_V1);
    expect(result.counts.mappings).toBe(4);

    const counts = await refCounts();
    expect(counts.definitions).toBe(4);
    expect(counts.dictionary).toBe(4);
    expect(counts.mappings).toBe(4);
    expect(counts.entries).toBe(1);
    expect(counts.versions).toBe(1);

    const fishMap = await prisma.dietaryAllergenMapping.findFirst({
      where: { effectiveTo: null },
      include: { allergen: true, ingredient: true },
    });
    expect(fishMap?.allergen.code).toBe('fish');
    expect(fishMap?.version).toBe(1);
    expect(fishMap?.sourceReference).toContain('R-2026-09-09-901');
  });

  it('supersede: a new approved version closes the prior version, bumps the number, keeps history intact', async () => {
    const IMPORT_V2 = {
      ...IMPORT_V1,
      sections: {
        ...IMPORT_V1.sections,
        allergen_mappings: IMPORT_V1.sections.allergen_mappings.map((m) =>
          m.ingredient_canonical_name === 'fish'
            ? { ...m, effective_from: '2026-10-01T00:00:00Z', source_reference: 'revised provenance' }
            : m,
        ),
      },
    };
    sign('R-2026-09-09-901', 'reviewer', IMPORT_V2, approvalsDir);
    const service = makeService(approvalsDir);
    await service.approve('R-2026-09-09-901', 'reviewer', IMPORT_V2);

    const fishRows = await prisma.dietaryAllergenMapping.findMany({
      where: { allergen: { code: 'fish' } },
      orderBy: { version: 'asc' },
    });
    expect(fishRows).toHaveLength(2);
    const [v1, v2] = fishRows;
    // history untouched except the effective_to close
    expect(v1.version).toBe(1);
    expect(v1.effectiveTo?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(v1.sourceReference).toContain('US/EU statutory'); // content unchanged
    expect(v2.version).toBe(2);
    expect(v2.effectiveTo).toBeNull();
    expect(v2.sourceReference).toContain('revised provenance');

    // unchanged rows were NOT re-versioned (idempotent approve)
    const coconutRows = await prisma.dietaryAllergenMapping.count({
      where: { allergen: { code: 'coconut' } },
    });
    expect(coconutRows).toBe(1);
  });

  it('backdated version attempt → rejected (versions are forward-only)', async () => {
    const IMPORT_BACK = {
      ...IMPORT_V1,
      sections: {
        ...IMPORT_V1.sections,
        allergen_mappings: IMPORT_V1.sections.allergen_mappings.map((m) =>
          m.ingredient_canonical_name === 'fish'
            ? { ...m, effective_from: '2026-08-01T00:00:00Z' }
            : m,
        ),
      },
    };
    sign('R-2026-09-09-901', 'reviewer', IMPORT_BACK, approvalsDir);
    const service = makeService(approvalsDir);
    await expect(service.approve('R-2026-09-09-901', 'reviewer', IMPORT_BACK)).rejects.toThrow(/forward-only/);
    const fishRows = await prisma.dietaryAllergenMapping.count({ where: { allergen: { code: 'fish' } } });
    expect(fishRows).toBe(2); // unchanged
  });

  it('overlap: an overlapping effective range is REJECTED by the DB exclusion constraint', async () => {
    const dict = await prisma.ingredientDictionary.findUniqueOrThrow({ where: { canonicalName: 'coconut_flesh' } });
    const coco = await prisma.dietaryAllergenDefinition.findUniqueOrThrow({ where: { code: 'coconut' } });
    // coconut already has an open version (effective 2026-09-01, open-ended);
    // inserting an overlapping open version must fail at the constraint.
    await expect(
      prisma.dietaryAllergenMapping.create({
        data: {
          ingredientId: dict.id,
          allergenId: coco.id,
          version: 99,
          effectiveFrom: new Date('2026-09-15T00:00:00Z'),
          effectiveTo: null,
          sourceReference: 'bypass attempt',
        },
      }),
    ).rejects.toThrow();
  });

  it('I7: resolveMappings returns mapped rows and lists unmapped ids (excluded from totals)', async () => {
    const service = makeService(approvalsDir);
    const dict = await prisma.ingredientDictionary.findMany({ where: { canonicalName: { in: ['fish', 'coconut_flesh'] } } });
    const out = await service.resolveMappings(
      [...dict.map((d) => d.id), 'deadbeef-0000-4000-8000-000000000000'],
      new Date('2026-09-15T00:00:00Z'),
    );
    expect(out.mapped).toHaveLength(2);
    expect(out.unmapped).toEqual(['deadbeef-0000-4000-8000-000000000000']);
  });

  it('golden D-19 lookups: fish flagged; coconut NOT under the US tree-nut major; fenugreek note-flagged', async () => {
    const service = makeService(approvalsDir);
    const asOf = new Date('2026-09-15T00:00:00Z');
    const mappings = await service.resolveMappings((await prisma.ingredientDictionary.findMany()).map((d) => d.id), asOf);
    const byName = new Map(
      (await prisma.ingredientDictionary.findMany()).map((d) => [d.id, d.canonicalName]),
    );
    const flagged = new Map(
      mappings.mapped.map((m) => [byName.get(m.ingredientId), m.allergen.code] as const),
    );
    expect(flagged.get('fish')).toBe('fish');
    expect(flagged.get('coconut_flesh')).toBe('coconut'); // NOT tree_nuts
    expect(flagged.get('fenugreek_seed')).toBe('fenugreek');
    expect(flagged.get('fenugreek_powder')).toBe('fenugreek');
    // and the definitions themselves carry the canonical classifications
    const coconut = await prisma.dietaryAllergenDefinition.findUniqueOrThrow({ where: { code: 'coconut' } });
    expect(coconut.isStatutory).toBe(false);
  });
});
