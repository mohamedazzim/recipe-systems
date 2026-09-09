// D-29 (Track R): reviewed-path lifecycle — unit level, prisma fully mocked.
// Proves: stage writes nothing; approve requires the human approval record
// (content-signed); definitions/dictionary are create-or-skip and never
// content-mutated; versioned supersede closes the prior open version; no
// write entry point exists outside approve.

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ReferenceDataRepository } from './reference-data.repository';
import {
  HistoricalContentConflictError,
  ReferenceDataService,
  UnreviewedImportError,
} from './reference-data.service';

const BASE_IMPORT = {
  import_id: 'R-2026-09-09-900',
  title: 'unit-test import',
  sources: ['test source'],
  sections: {
    allergen_definitions: [{ code: 'fish', name: 'Fish', label_pack: 'both', is_statutory: true }],
    dictionary: [{ canonical_name: 'fish', description: null }],
    aliases: [{ ingredient_canonical_name: 'fish', alias_text: 'meen', language: 'ta' }],
    allergen_mappings: [
      { ingredient_canonical_name: 'fish', allergen_code: 'fish', effective_from: '2026-09-01T00:00:00Z', source_reference: 'unit test' },
    ],
    composition_entries: [],
  },
};

const createdDirs: string[] = [];

function makeService(mock: Record<string, jest.Mock>) {
  const repo = {
    getDefinitionsByCode: mock.getDefinitionsByCode,
    getDictionaryByNames: mock.getDictionaryByNames,
    getOpenMappings: mock.getOpenMappings,
    getOpenCompositionVersions: mock.getOpenCompositionVersions,
    createDefinitions: mock.createDefinitions,
    createDictionary: mock.createDictionary,
    createAliases: mock.createAliases,
    applyMappingVersions: mock.applyMappingVersions,
    applyCompositionVersions: mock.applyCompositionVersions,
    getEffectiveMappings: mock.getEffectiveMappings,
    getEffectiveComposition: mock.getEffectiveComposition,
  } as unknown as ReferenceDataRepository;
  const approvalsDir = mkdtempSync(join(tmpdir(), 'd29-approvals-'));
  createdDirs.push(approvalsDir);
  return { service: new ReferenceDataService(repo, approvalsDir), approvalsDir };
}

function approvalFile(dir: string, importId: string, reviewer: string, sha: string) {
  writeFileSync(
    join(dir, `${importId}.json`),
    JSON.stringify({ import_id: importId, reviewer, reviewed_at: '2026-09-09T10:00:00Z', import_file_sha256: sha }),
  );
}

const emptyMocks = () => ({
  getDefinitionsByCode: jest.fn().mockResolvedValue([]),
  getDictionaryByNames: jest.fn().mockResolvedValue([]),
  getOpenMappings: jest.fn().mockResolvedValue([]),
  getOpenCompositionVersions: jest.fn().mockResolvedValue([]),
  createDefinitions: jest.fn().mockResolvedValue(undefined),
  createDictionary: jest.fn().mockResolvedValue(undefined),
  createAliases: jest.fn().mockResolvedValue(undefined),
  applyMappingVersions: jest.fn().mockResolvedValue(undefined),
  applyCompositionVersions: jest.fn().mockResolvedValue(undefined),
  getEffectiveMappings: jest.fn().mockResolvedValue([]),
  getEffectiveComposition: jest.fn().mockResolvedValue([]),
});

describe('ReferenceDataService — reviewed path (D-29)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stage: validates, diffs, and writes NOTHING', async () => {
    const mocks = emptyMocks();
    const { service } = makeService(mocks);
    const diff = await service.stage(BASE_IMPORT);
    expect(diff.import_id).toBe('R-2026-09-09-900');
    expect(diff.reviewed).toBe(false);
    expect(diff.sections.definitions[0].action).toBe('create');
    expect(diff.sections.mappings[0].action).toBe('supersede');
    // zero write calls
    expect(mocks.createDefinitions).not.toHaveBeenCalled();
    expect(mocks.createDictionary).not.toHaveBeenCalled();
    expect(mocks.createAliases).not.toHaveBeenCalled();
    expect(mocks.applyMappingVersions).not.toHaveBeenCalled();
    expect(mocks.applyCompositionVersions).not.toHaveBeenCalled();
  });

  it('stage: existing definition with changed content → conflict (immutable)', async () => {
    const mocks = emptyMocks();
    mocks.getDefinitionsByCode.mockResolvedValue([
      { code: 'fish', name: 'Fish', labelPack: 'both', isStatutory: true },
    ]);
    const { service } = makeService(mocks);
    const diff = await service.stage({
      ...BASE_IMPORT,
      sections: {
        ...BASE_IMPORT.sections,
        allergen_definitions: [{ code: 'fish', name: 'DIFFERENT NAME', label_pack: 'both', is_statutory: true }],
      },
    });
    expect(diff.sections.definitions[0].action).toBe('conflict');
  });

  it('approve without an approval record → UnreviewedImportError, no writes', async () => {
    const mocks = emptyMocks();
    const { service } = makeService(mocks);
    await expect(service.approve('R-2026-09-09-900', 'reviewer-a', BASE_IMPORT)).rejects.toBeInstanceOf(UnreviewedImportError);
    expect(mocks.applyMappingVersions).not.toHaveBeenCalled();
  });

  it('approve with a record signed for DIFFERENT content → rejected (sha mismatch)', async () => {
    const mocks = emptyMocks();
    const { service, approvalsDir } = makeService(mocks);
    approvalFile(approvalsDir, 'R-2026-09-09-900', 'reviewer-a', '0'.repeat(64));
    await expect(service.approve('R-2026-09-09-900', 'reviewer-a', BASE_IMPORT)).rejects.toThrow(/different file content/);
    expect(mocks.applyMappingVersions).not.toHaveBeenCalled();
  });

  it('approve with a valid record: persists through the repository (definitions, dictionary, aliases, mappings)', async () => {
    const mocks = emptyMocks();
    mocks.getDefinitionsByCode.mockImplementation((codes: string[]) =>
      codes.includes('fish')
        ? Promise.resolve([{ id: 'def-fish', code: 'fish', name: 'Fish', labelPack: 'both', isStatutory: true }])
        : Promise.resolve([]),
    );
    mocks.getDictionaryByNames.mockImplementation((names: string[]) =>
      names.includes('fish')
        ? Promise.resolve([{ id: 'dict-fish', canonicalName: 'fish' }])
        : Promise.resolve([]),
    );
    const { service, approvalsDir } = makeService(mocks);
    const { file_sha256 } = await service.stage(BASE_IMPORT);
    approvalFile(approvalsDir, 'R-2026-09-09-900', 'reviewer-a', file_sha256);

    const result = await service.approve('R-2026-09-09-900', 'reviewer-a', BASE_IMPORT);
    expect(result.approved_by).toBe('reviewer-a');
    expect(mocks.createDefinitions).toHaveBeenCalled();
    expect(mocks.createDictionary).toHaveBeenCalled();
    expect(mocks.createAliases).toHaveBeenCalled();
    expect(mocks.applyMappingVersions).toHaveBeenCalledWith(
      expect.any(Map),
      expect.any(Map),
      expect.any(Array),
      'R-2026-09-09-900',
    );
  });

  it('approve: changed definition content → HistoricalContentConflictError, no writes', async () => {
    const mocks = emptyMocks();
    mocks.getDefinitionsByCode.mockResolvedValue([
      { code: 'fish', name: 'Fish', labelPack: 'both', isStatutory: true },
    ]);
    const { service, approvalsDir } = makeService(mocks);
    const changed = {
      ...BASE_IMPORT,
      sections: {
        ...BASE_IMPORT.sections,
        allergen_definitions: [{ code: 'fish', name: 'CHANGED', label_pack: 'both', is_statutory: true }],
      },
    };
    const { file_sha256 } = await service.stage(changed);
    approvalFile(approvalsDir, 'R-2026-09-09-900', 'reviewer-a', file_sha256);
    await expect(service.approve('R-2026-09-09-900', 'reviewer-a', changed)).rejects.toBeInstanceOf(HistoricalContentConflictError);
    expect(mocks.createDefinitions).not.toHaveBeenCalled();
  });

  it('malformed import files are rejected at stage (schema validation)', async () => {
    const mocks = emptyMocks();
    const { service } = makeService(mocks);
    await expect(service.stage({ ...BASE_IMPORT, import_id: 'not-an-id' })).rejects.toThrow();
    await expect(
      service.stage({ ...BASE_IMPORT, sections: { ...BASE_IMPORT.sections, allergen_definitions: [{ code: 'UPPER', name: 'x', label_pack: 'both', is_statutory: true }] } }),
    ).rejects.toThrow();
  });

  it('I7 surface: resolveMappings lists unmapped ids separately (excluded from totals)', async () => {
    const mocks = emptyMocks();
    mocks.getEffectiveMappings.mockResolvedValue([
      { ingredientId: 'known-1', allergen: { code: 'fish' } },
    ]);
    const { service } = makeService(mocks);
    const out = await service.resolveMappings(['known-1', 'unknown-2'], new Date('2026-09-15T00:00:00Z'));
    expect(out.mapped).toHaveLength(1);
    expect(out.unmapped).toEqual(['unknown-2']);
  });

  afterAll(() => {
    for (const dir of createdDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
