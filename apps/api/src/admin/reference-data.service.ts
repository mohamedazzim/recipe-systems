// D-29 (Track R): the reviewed import path (ADR §7).
//
//   stage(file)   -> validate + diff against live data. WRITES NOTHING.
//   approve(...)  -> requires the human approval record; persists effective-dated
//                    versions through the repository (the module's sole writer).
//
// No other write path exists: unreviewed staged data can never reach the live
// reference tables (A-29 BLOCKER class). Q5 stays OPEN — dictionary/alias work
// runs under the labeled admin-module working assumption (SCAFFOLD §7).

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ReferenceDataRepository } from './reference-data.repository';
import {
  approvalRecordSchema,
  referenceDataImportSchema,
  ReferenceDataImport,
  StagedDiff,
} from './import.schema';

export class UnreviewedImportError extends Error {
  constructor(importId: string) {
    super(`import ${importId} has no human approval record — the reviewed path requires stage -> diff -> approval -> persist`);
    this.name = 'UnreviewedImportError';
  }
}

export class HistoricalContentConflictError extends Error {
  constructor(key: string) {
    super(`existing reference row "${key}" differs from the import; historical rows are never mutated in place (create a new version instead)`);
    this.name = 'HistoricalContentConflictError';
  }
}

export class ReferenceDataService {
  constructor(
    private readonly repo: ReferenceDataRepository,
    private readonly approvalsDir: string,
  ) {}

  /** Validates an import file and diffs it against live data. NEVER writes. */
  async stage(raw: unknown): Promise<StagedDiff> {
    const file = referenceDataImportSchema.parse(raw);
    const sha = createHash('sha256').update(JSON.stringify(file)).digest('hex');

    const codes = file.sections.allergen_definitions.map((d) => d.code);
    const names = file.sections.dictionary.map((d) => d.canonical_name);
    const [defs, dict, openMappings, openComposition] = await Promise.all([
      this.repo.getDefinitionsByCode(codes),
      this.repo.getDictionaryByNames(names),
      this.repo.getOpenMappings(),
      this.repo.getOpenCompositionVersions(),
    ]);

    const defByCode = new Map(defs.map((d) => [d.code, d]));
    const dictByName = new Map(dict.map((d) => [d.canonicalName, d]));
    const openMapKey = new Set(
      openMappings.map((m) => `${m.ingredientId}|${m.allergenId}`),
    );
    const openCompByEntry = new Map(
      openComposition.map((v) => [v.entryId, v]),
    );

    const diff: StagedDiff['sections'] = {
      definitions: [],
      dictionary: [],
      aliases: [],
      mappings: [],
      composition: [],
    };

    for (const d of file.sections.allergen_definitions) {
      const existing = defByCode.get(d.code);
      if (!existing) {
        diff.definitions.push({ action: 'create', key: d.code, detail: d.name });
      } else if (
        existing.name === d.name &&
        (existing.labelPack ?? null) === (d.label_pack ?? null) &&
        existing.isStatutory === d.is_statutory
      ) {
        diff.definitions.push({ action: 'skip', key: d.code, detail: 'identical' });
      } else {
        diff.definitions.push({
          action: 'conflict',
          key: d.code,
          detail: `import differs from existing row — definitions are immutable; reject`,
        });
      }
    }

    for (const d of file.sections.dictionary) {
      if (!dictByName.has(d.canonical_name)) {
        diff.dictionary.push({ action: 'create', key: d.canonical_name, detail: d.description ?? '' });
      } else {
        diff.dictionary.push({ action: 'skip', key: d.canonical_name, detail: 'exists' });
      }
    }

    for (const a of file.sections.aliases) {
      diff.aliases.push({
        action: 'create',
        key: a.alias_text,
        detail: `-> ${a.ingredient_canonical_name}`,
      });
    }

    for (const m of file.sections.allergen_mappings) {
      diff.mappings.push({
        action: 'supersede',
        key: `${m.ingredient_canonical_name} -> ${m.allergen_code}`,
        detail: `effective ${m.effective_from}${m.source_reference ? ` (${m.source_reference})` : ''}`,
        prior_version: null,
      });
    }

    for (const c of file.sections.composition_entries) {
      diff.composition.push({
        action: 'supersede',
        key: `${c.ingredient_canonical_name} :: ${c.external_source}/${c.external_id}`,
        detail: c.food_name,
        prior_version: null,
      });
    }

    void openMapKey;
    void openCompByEntry;
    return {
      import_id: file.import_id,
      title: file.title,
      reviewed: false,
      file_sha256: sha,
      sections: diff,
    };
  }

  /** The ONLY persist entry point. Requires the human approval record. */
  async approve(importId: string, reviewer: string, rawFile: unknown): Promise<{
    import_id: string;
    approved_by: string;
    counts: { definitions: number; dictionary: number; aliases: number; mappings: number; composition_entries: number };
  }> {
    const file: ReferenceDataImport = referenceDataImportSchema.parse(rawFile);
    if (file.import_id !== importId) {
      throw new Error(`import id mismatch: requested ${importId}, file is ${file.import_id}`);
    }
    const sha = createHash('sha256').update(JSON.stringify(file)).digest('hex');

    const approvalPath = join(this.approvalsDir, `${importId}.json`);
    if (!existsSync(approvalPath)) {
      throw new UnreviewedImportError(importId);
    }
    const record = approvalRecordSchema.parse(JSON.parse(readFileSync(approvalPath, 'utf8')));
    if (record.import_id !== importId || record.reviewer !== reviewer) {
      throw new UnreviewedImportError(importId);
    }
    if (record.import_file_sha256 !== sha) {
      throw new Error(`approval record was signed for a different file content (sha mismatch) — re-stage and re-approve`);
    }

    const {
      allergen_definitions = [],
      dictionary = [],
      aliases = [],
      allergen_mappings = [],
      composition_entries = [],
    } = file.sections;

    // immutability pre-checks: existing definitions/dictionary content is never mutated
    const existingDefs = await this.repo.getDefinitionsByCode(allergen_definitions.map((d) => d.code));
    const defByCode = new Map(existingDefs.map((d) => [d.code, d]));
    for (const d of allergen_definitions) {
      const existing = defByCode.get(d.code);
      if (existing && (existing.name !== d.name || (existing.labelPack ?? null) !== (d.label_pack ?? null) || existing.isStatutory !== d.is_statutory)) {
        throw new HistoricalContentConflictError(`allergen definition ${d.code}`);
      }
    }

    // create-only paths
    const newDefs = allergen_definitions
      .filter((d) => !defByCode.has(d.code))
      .map((d) => ({ code: d.code, name: d.name, label_pack: d.label_pack, is_statutory: d.is_statutory }));
    await this.repo.createDefinitions(newDefs);

    const existingDict = await this.repo.getDictionaryByNames(dictionary.map((d) => d.canonical_name));
    const dictNames = new Set(existingDict.map((d) => d.canonicalName));
    const newDict = dictionary
      .filter((d) => !dictNames.has(d.canonical_name))
      .map((d) => ({ canonical_name: d.canonical_name, description: d.description ?? null }));
    await this.repo.createDictionary(newDict); // Q5 WORKING ASSUMPTION

    // resolve ids for ALL referenced dictionary names — including names that
    // live in the current import's dictionary section OR were loaded by an
    // earlier approved import (mappings/composition imports carry no
    // dictionary section of their own)
    const referencedNames = Array.from(
      new Set([
        ...dictionary.map((d) => d.canonical_name),
        ...aliases.map((a) => a.ingredient_canonical_name),
        ...allergen_mappings.map((m) => m.ingredient_canonical_name),
        ...composition_entries.map((c) => c.ingredient_canonical_name),
      ]),
    );
    const allDict = await this.repo.getDictionaryByNames(referencedNames);
    const ingredientIdByName = new Map(allDict.map((d) => [d.canonicalName, d.id]));
    const missingNames = referencedNames.filter((n) => !ingredientIdByName.has(n));
    if (missingNames.length > 0) {
      throw new Error(`import references dictionary rows that do not exist (load them via a reviewed dictionary import first): ${missingNames.join(', ')}`);
    }
    await this.repo.createAliases(
      ingredientIdByName,
      aliases.map((a) => ({
        ingredient_canonical_name: a.ingredient_canonical_name,
        alias_text: a.alias_text,
        language: a.language ?? null,
        requires_confirmation: a.requires_confirmation ?? false,
      })),
    ); // Q5 WORKING ASSUMPTION

    const allergenIdByCode = new Map(
      (await this.repo.getDefinitionsByCode(allergen_mappings.map((m) => m.allergen_code))).map((d) => [d.code, d.id]),
    );
    await this.repo.applyMappingVersions(
      ingredientIdByName,
      allergenIdByCode,
      allergen_mappings.map((m) => ({
        ingredient_canonical_name: m.ingredient_canonical_name,
        allergen_code: m.allergen_code,
        effective_from: new Date(m.effective_from),
        source_reference: m.source_reference ?? null,
      })),
      importId,
    );

    await this.repo.applyCompositionVersions(
      ingredientIdByName,
      composition_entries.map((c) => ({
        ingredient_canonical_name: c.ingredient_canonical_name,
        external_source: c.external_source,
        external_id: c.external_id,
        food_name: c.food_name,
        is_primary_for_ingredient: c.is_primary_for_ingredient,
        versions: c.versions.map((v) => ({
          energy_kcal_per_100g: v.energy_kcal_per_100g ?? null,
          protein_g_per_100g: v.protein_g_per_100g ?? null,
          fat_g_per_100g: v.fat_g_per_100g ?? null,
          carb_g_per_100g: v.carb_g_per_100g ?? null,
          fiber_g_per_100g: v.fiber_g_per_100g ?? null,
          sodium_mg_per_100g: v.sodium_mg_per_100g ?? null,
          source_version: v.source_version,
          effective_from: new Date(v.effective_from),
        })),
      })),
      importId,
    );

    return {
      import_id: importId,
      approved_by: reviewer,
      counts: {
        definitions: newDefs.length,
        dictionary: newDict.length,
        aliases: aliases.length,
        mappings: allergen_mappings.length,
        composition_entries: composition_entries.length,
      },
    };
  }

  /** I7 lookup surface (consumed by D-19): mapped rows + the unmapped id list. */
  async resolveMappings(ingredientIds: string[], asOf: Date) {
    const rows = await this.repo.getEffectiveMappings(asOf);
    const mapped = rows.filter((r) => ingredientIds.includes(r.ingredientId));
    const mappedIds = new Set(mapped.map((r) => r.ingredientId));
    const unmapped = ingredientIds.filter((id) => !mappedIds.has(id));
    return { mapped, unmapped };
  }

  /** I7 lookup surface: effective composition rows for the given dictionary ids. */
  async resolveComposition(ingredientIds: string[], asOf: Date) {
    const rows = await this.repo.getEffectiveComposition(asOf);
    const matched = rows.filter((r) => ingredientIds.includes(r.entry.ingredientId));
    const matchedIds = new Set(matched.map((r) => r.entry.ingredientId));
    const unmapped = ingredientIds.filter((id) => !matchedIds.has(id));
    return { matched, unmapped };
  }
}
