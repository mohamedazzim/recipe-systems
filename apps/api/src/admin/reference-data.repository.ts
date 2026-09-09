// D-29 (Track R): the reference-data REPOSITORY is the sole writer of the
// curated reference tables (ADR §2 one-writer; A-29 one-writer grep).
//
//   dietary_allergen_definition, dietary_allergen_mapping,
//   nutrition_food_composition_entry, nutrition_food_composition_version,
//   and — Q5 WORKING ASSUMPTION (SCAFFOLD §7; Q5 OPEN, not a final decision) —
//   ingredient_dictionary / ingredient_alias.
//
// Rules enforced by this module's design (tests prove each):
//  - NO public write entry point exists except through ReferenceDataService.approve()
//    (the reviewed path: stage -> diff -> human approval -> effective-dated insert).
//  - Historical rows are never mutated: the ONLY update this repository performs
//    is closing an OPEN version's effective_to at supersede time (ADR §7
//    versioning; A-29 "UPDATE to a historical version is a BLOCKER").
//  - Content columns of existing rows are never updated — no code path exists.
//  - Overlap rejection is the database's job: the EXCLUDE USING gist constraints
//    from migration 002 reject overlapping effective ranges.

import { PrismaClient } from '@recipe-systems/database';

/** source_version (VARCHAR(128)) carries the source identity + import id; fail
 *  fast with a clear message instead of a cryptic DB column-overflow. */
function composeSourceVersion(sourceVersion: string, importId: string): string {
  const composed = `${sourceVersion} [import ${importId}]`;
  if (composed.length > 128) {
    throw new Error(
      `composition source_version too long (${composed.length} > 128 chars): shorten the source_version to <=${128 - (importId.length + 10)} chars`,
    );
  }
  return composed;
}

export interface AllergenDefinitionRow {
  code: string;
  name: string;
  label_pack: 'US' | 'EU' | 'both' | null;
  is_statutory: boolean;
}

export interface DictionaryRow {
  canonical_name: string;
  description?: string | null;
}

export interface AliasRow {
  ingredient_canonical_name: string;
  alias_text: string;
  language?: string | null;
  requires_confirmation?: boolean;
}

export interface AllergenMappingRow {
  ingredient_canonical_name: string;
  allergen_code: string;
  effective_from: Date;
  source_reference: string | null;
}

export interface CompositionEntryRow {
  ingredient_canonical_name: string;
  external_source: string;
  external_id: string;
  food_name: string;
  is_primary_for_ingredient: boolean;
  versions: Array<{
    energy_kcal_per_100g: string | null;
    protein_g_per_100g: string | null;
    fat_g_per_100g: string | null;
    carb_g_per_100g: string | null;
    fiber_g_per_100g: string | null;
    sodium_mg_per_100g: string | null;
    source_version: string;
    effective_from: Date;
  }>;
}

export class ReferenceDataRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ─────────────────────────── reads ───────────────────────────

  async getDefinitionsByCode(codes: string[]) {
    return this.prisma.dietaryAllergenDefinition.findMany({
      where: { code: { in: codes } },
    });
  }

  async getDictionaryByNames(names: string[]) {
    return this.prisma.ingredientDictionary.findMany({
      where: { canonicalName: { in: names } },
    });
  }

  async getOpenMappings() {
    // the currently-live version of every (ingredient, allergen) pair
    return this.prisma.dietaryAllergenMapping.findMany({ where: { effectiveTo: null } });
  }

  async getOpenCompositionVersions() {
    return this.prisma.nutritionFoodCompositionVersion.findMany({
      where: { effectiveTo: null },
      include: { entry: true },
    });
  }

  /** Effective-dated read surface (I7 / D-19 lookup): mappings live at `asOf`. */
  async getEffectiveMappings(asOf: Date) {
    return this.prisma.dietaryAllergenMapping.findMany({
      where: {
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
      },
      include: { allergen: true, ingredient: true },
    });
  }

  /** Effective-dated composition read surface (I7 / D-19 lookup). */
  async getEffectiveComposition(asOf: Date) {
    return this.prisma.nutritionFoodCompositionVersion.findMany({
      where: {
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
      },
      include: { entry: true },
    });
  }

  // ──────────────────────── writes (reviewed path only) ────────────────────────

  async createDefinitions(rows: AllergenDefinitionRow[]) {
    if (rows.length === 0) return;
    await this.prisma.dietaryAllergenDefinition.createMany({
      data: rows.map((r) => ({
        code: r.code,
        name: r.name,
        labelPack: r.label_pack,
        isStatutory: r.is_statutory,
      })),
    });
  }

  /** Q5 WORKING ASSUMPTION (SCAFFOLD §7) — writer of ingredient_dictionary
   *  pending Q5 resolution; not a final architecture decision. */
  async createDictionary(rows: DictionaryRow[]) {
    if (rows.length === 0) return;
    await this.prisma.ingredientDictionary.createMany({
      data: rows.map((r) => ({ canonicalName: r.canonical_name, description: r.description ?? null })),
    });
  }

  /** Q5 WORKING ASSUMPTION (SCAFFOLD §7) — writer of ingredient_alias. */
  async createAliases(ingredientIdByName: Map<string, string>, rows: AliasRow[]) {
    if (rows.length === 0) return;
    const data = rows.map((r) => {
      const ingredientId = ingredientIdByName.get(r.ingredient_canonical_name);
      if (!ingredientId) throw new Error(`alias references unknown dictionary row: ${r.ingredient_canonical_name}`);
      return {
        ingredientId,
        aliasText: r.alias_text,
        language: r.language ?? null,
        requiresConfirmation: r.requires_confirmation ?? false,
      };
    });
    await this.prisma.ingredientAlias.createMany({ data });
  }

  /**
   * Effective-dated versioning (ADR §7): a new mapping version closes the open
   * version (effective_to = new effective_from) and inserts version N+1.
   * Overlaps are rejected by the EXCLUDE USING gist constraint (migration 002).
   */
  async applyMappingVersions(
    ingredientIdByName: Map<string, string>,
    allergenIdByCode: Map<string, string>,
    rows: AllergenMappingRow[],
    importId: string,
  ) {
    for (const row of rows) {
      const ingredientId = ingredientIdByName.get(row.ingredient_canonical_name);
      const allergenId = allergenIdByCode.get(row.allergen_code);
      if (!ingredientId) throw new Error(`mapping references unknown dictionary row: ${row.ingredient_canonical_name}`);
      if (!allergenId) throw new Error(`mapping references unknown allergen code: ${row.allergen_code}`);

      const open = await this.prisma.dietaryAllergenMapping.findFirst({
        where: { ingredientId, allergenId, effectiveTo: null },
        orderBy: { version: 'desc' },
      });

      if (open) {
        if (open.effectiveFrom.getTime() === row.effective_from.getTime()) {
          // already applied by an earlier approve of the same import — idempotent no-op
          continue;
        }
        if (open.effectiveFrom.getTime() > row.effective_from.getTime()) {
          throw new Error(
            `backdated mapping version rejected for ${row.ingredient_canonical_name} -> ${row.allergen_code}: ` +
            `open version starts ${open.effectiveFrom.toISOString()}, import effective_from is earlier — versions are forward-only`,
          );
        }
      }

      await this.prisma.$transaction(async (tx) => {
        if (open) {
          // the ONLY historical-row update in this module: closing an open
          // version. Content columns are never touched.
          await tx.dietaryAllergenMapping.update({
            where: { id: open.id },
            data: { effectiveTo: row.effective_from },
          });
        }
        const ref = `${row.source_reference ?? ''} [import ${importId}]`.trim();
        await tx.dietaryAllergenMapping.create({
          data: {
            ingredientId,
            allergenId,
            version: (open?.version ?? 0) + 1,
            effectiveFrom: row.effective_from,
            effectiveTo: null,
            sourceReference: ref,
          },
        });
      });
    }
  }

  /** Same effective-dated semantics for nutrition composition versions. */
  async applyCompositionVersions(
    ingredientIdByName: Map<string, string>,
    rows: CompositionEntryRow[],
    importId: string,
  ) {
    for (const row of rows) {
      const ingredientId = ingredientIdByName.get(row.ingredient_canonical_name);
      if (!ingredientId) throw new Error(`composition references unknown dictionary row: ${row.ingredient_canonical_name}`);

      let entry = await this.prisma.nutritionFoodCompositionEntry.findUnique({
        where: {
          externalSource_externalId: {
            externalSource: row.external_source,
            externalId: row.external_id,
          },
        },
      });
      if (!entry) {
        entry = await this.prisma.nutritionFoodCompositionEntry.create({
          data: {
            ingredientId,
            externalSource: row.external_source,
            externalId: row.external_id,
            foodName: row.food_name,
            isPrimaryForIngredient: row.is_primary_for_ingredient,
          },
        });
      }

      for (const v of row.versions) {
        const open = await this.prisma.nutritionFoodCompositionVersion.findFirst({
          where: { entryId: entry.id, effectiveTo: null },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (open) {
          if (open.effectiveFrom.getTime() === v.effective_from.getTime()) {
            // already applied — idempotent no-op
            continue;
          }
          if (open.effectiveFrom.getTime() > v.effective_from.getTime()) {
            throw new Error(
              `backdated composition version rejected for ${row.ingredient_canonical_name}: versions are forward-only`,
            );
          }
        }
        await this.prisma.$transaction(async (tx) => {
          if (open) {
            // only closing an open version — content is never mutated
            await tx.nutritionFoodCompositionVersion.update({
              where: { id: open.id },
              data: { effectiveTo: v.effective_from },
            });
          }
          await tx.nutritionFoodCompositionVersion.create({
            data: {
              entryId: entry.id,
              energyKcalPer100g: v.energy_kcal_per_100g,
              proteinGPer100g: v.protein_g_per_100g,
              fatGPer100g: v.fat_g_per_100g,
              carbGPer100g: v.carb_g_per_100g,
              fiberGPer100g: v.fiber_g_per_100g,
              sodiumMgPer100g: v.sodium_mg_per_100g,
              sourceVersion: composeSourceVersion(v.source_version, importId),
              effectiveFrom: v.effective_from,
              effectiveTo: null,
            },
          });
        });
      }
    }
  }
}
