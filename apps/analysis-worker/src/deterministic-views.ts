// D-19 (P4-1): deterministic View 8 + View 9 producers (Deterministic Views v2).
// NO LLM — computed in the analysis worker (the sole analysis_* writer) from the
// captured structured recipe + the D-29 reviewed reference tables (effective-dated
// reads at job time). Grounded by construction (INV-10): only captured ingredient
// ids are ever resolved; every unresolved line is I7-unmapped (excluded from
// totals and listed). Frozen D-05 payload contracts (View8PayloadSchema /
// View9PayloadSchema) are the binding output shapes.
//
// D-19-labeled assumptions (recorded in HANDOFF §5 D-19 execution entry):
//   - minimal display-name → dictionary resolution (word-subsequence matching
//     over canonical_name + alias_text); full alias UX is D-25.
//   - default unit masses for mapped ingredients (ASSIMED, derived from the
//     Recipe_Systems §6 worked example).
//   - initial fish_class is 'both' (lean→oily band, canonical "species unknown");
//     an I2 assumption edit may pin one class.

import type { PrismaClient } from '@recipe-systems/database';
import type { StructuredRecipeInput, View8Payload, View9Payload } from '@recipe-systems/schemas';

/** H6 — verbatim on every View 8 surface (Epic-H boundary; DISPATCH D-19). */
export const H6_DISCLAIMER =
  'Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.';

/** I6 — verbatim on every View 9 surface (Epic-I boundary; DISPATCH D-19). */
export const I6_DISCLAIMER =
  'Table estimate from stated assumptions. Not a lab analysis. Not medical advice.';

// ─────────────────────────── resolution ───────────────────────────

export interface ResolvedIngredient {
  id: string;
  display_name: string;
  amount_text: string | null;
  quantity: number | null;
  unit: string | null;
  /** null = I7-unmapped (no dictionary row matched). */
  dictionary_id: string | null;
  canonical_name: string | null;
}

function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[—–\-,()_]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isSubsequence(needle: string[], haystack: string[]): boolean {
  let i = 0;
  for (const word of haystack) {
    if (needle[i] === word) i += 1;
    if (i === needle.length) return true;
  }
  return i === needle.length;
}

interface DictionaryCandidate {
  id: string;
  canonical: string;
  keys: string[][];
}

/** Word-subsequence resolution over the curated dictionary + aliases. */
function matchDictionary(
  displayWords: string[],
  candidates: DictionaryCandidate[],
): DictionaryCandidate | null {
  let best: { candidate: DictionaryCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    for (const key of candidate.keys) {
      if (isSubsequence(key, displayWords)) {
        const score = key.length;
        if (!best || score > best.score) best = { candidate, score };
      }
    }
  }
  return best ? best.candidate : null;
}

/** Bare-word disambiguation (D-19-labeled): canonical defaults when a display
 *  name matches several single-word dictionary concepts. */
const BARE_DEFAULT: Record<string, string> = {
  fenugreek: 'fenugreek_seed', // canonical tadka default (§6)
  coconut: 'coconut_flesh', // bare "coconut" = the flesh
  chilli: 'chilli_green', // "chilli" without "powder" = fresh
  mustard: 'mustard_seed', // bare "mustard" = the seed (§6 tadka)
};

const DISAMBIGUATORS: Record<string, Array<{ word: string; canonical: string }>> = {
  coconut: [
    { word: 'oil', canonical: 'coconut_oil' },
    { word: 'grated', canonical: 'coconut_flesh' },
    { word: 'milk', canonical: 'coconut_flesh' },
  ],
  chilli: [
    { word: 'powder', canonical: 'chilli_powder' },
    { word: 'green', canonical: 'chilli_green' },
  ],
  fenugreek: [
    { word: 'powder', canonical: 'fenugreek_powder' },
    { word: 'methi', canonical: 'fenugreek_seed' },
  ],
};

export async function resolveIngredients(
  prisma: PrismaClient,
  ingredients: StructuredRecipeInput['structured_recipe']['ingredients'],
): Promise<ResolvedIngredient[]> {
  const [dictionary, aliases] = await Promise.all([
    prisma.ingredientDictionary.findMany(),
    prisma.ingredientAlias.findMany(),
  ]);
  const candidates: DictionaryCandidate[] = dictionary.map((d) => ({
    id: d.id,
    canonical: d.canonicalName,
    keys: [normalizeWords(d.canonicalName)],
  }));
  for (const alias of aliases) {
    const target = candidates.find((c) => c.id === alias.ingredientId);
    if (target) target.keys.push(normalizeWords(alias.aliasText));
  }
  const byCanonical = new Map(dictionary.map((d) => [d.canonicalName, d.id]));

  return ingredients.map((ingredient) => {
    const words = normalizeWords(ingredient.display_name);
    let match = matchDictionary(words, candidates);
    if (!match) {
      // bare-word fallback: a single known concept word present in the display
      const bareWords = Object.keys(BARE_DEFAULT).filter((w) => words.includes(w));
      if (bareWords.length > 0) {
        let canonical = BARE_DEFAULT[bareWords[0]];
        for (const word of bareWords) {
          for (const rule of DISAMBIGUATORS[word] ?? []) {
            if (words.includes(rule.word)) canonical = rule.canonical;
          }
        }
        const id = byCanonical.get(canonical);
        if (id) match = { id, canonical, keys: [] };
      }
    }
    return {
      id: ingredient.id,
      display_name: ingredient.display_name,
      amount_text: ingredient.amount_text,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      dictionary_id: match ? match.id : null,
      canonical_name: match ? match.canonical : null,
    };
  });
}

// ─────────────────────────── View 8 ───────────────────────────

function titleLabel(code: string): string {
  return code
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

/** Canonical §6 adaptation-cost phrasing, keyed by allergen code. */
const REMOVAL_NOTES: Record<string, string> = {
  fish: 'Removing the fish changes the dish\u2019s identity \u2014 not this dish.',
  coconut: 'Removing the coconut changes the architecture \u2014 not this dish.',
  mustard: 'Removing it changes the tadka; the dish is still a kuzhambu.',
  fenugreek: 'Removing it changes the finish; the dish still reads as a kuzhambu.',
};

export async function computeView8(
  prisma: PrismaClient,
  captured: StructuredRecipeInput,
): Promise<View8Payload> {
  const resolved = await resolveIngredients(prisma, captured.structured_recipe.ingredients);
  const dictionaryIds = resolved
    .map((r) => r.dictionary_id)
    .filter((id): id is string => id !== null);

  const asOf = new Date();
  const mappings = await prisma.dietaryAllergenMapping.findMany({
    where: {
      ingredientId: { in: dictionaryIds },
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
    },
    include: { allergen: true },
  });

  const codes: string[] = [];
  for (const mapping of mappings) {
    if (!codes.includes(mapping.allergen.code)) codes.push(mapping.allergen.code);
  }

  const present = codes.map(titleLabel);
  return {
    present,
    not_on_card: captured.structured_recipe.explicitly_absent,
    unknown: [],
    removal_notes: codes
      .filter((code) => REMOVAL_NOTES[code] !== undefined)
      .map((code) => ({ item: titleLabel(code), note: REMOVAL_NOTES[code] })),
    disclaimer: H6_DISCLAIMER,
    allergen_line: {
      contains: present,
      notes: codes.includes('fish') ? ['Fish species unknown.'] : [],
      unknown: [],
    },
  };
}

// ─────────────────────────── View 9 ───────────────────────────

export type FishClass = 'lean' | 'oily' | 'both';

export interface View9Overrides {
  fish_class: FishClass;
  coconut_grams: [number, number];
  oil_tbsp: [number, number];
}

/** I2 user-editable delta (RS-US-45 body). */
export interface View9AssumptionDelta {
  fish_class?: 'lean' | 'oily';
  coconut_grams?: number;
  oil_tbsp?: number;
}

export const DEFAULT_OVERRIDES: View9Overrides = {
  fish_class: 'both',
  coconut_grams: [150, 200], // §6: half-shell grated meat, ASSUMED
  oil_tbsp: [1, 2], // §6: "for tempering", ASSUMED
};

interface MassDefaults {
  nos_g?: number;
  tsp_g?: number;
  default_g?: [number, number];
}

/** D-19-labeled default unit masses (Recipe_Systems §6 worked example). */
const DEFAULT_MASS: Record<string, MassDefaults> = {
  drumstick: { nos_g: 150 },
  mango: { nos_g: 240 },
  coconut_flesh: { default_g: [150, 200] },
  coconut_oil: { default_g: [14, 28] }, // 1–2 tbsp ≈ 14–28 g
  chilli_green: { nos_g: 15 },
  chilli_powder: { tsp_g: 2.5 },
  coriander_powder: { tsp_g: 2.5 },
  tamarind: { default_g: [25, 25] }, // "a lemon size"
  fenugreek_seed: { tsp_g: 2 },
  mustard_seed: { tsp_g: 2.5 },
};

function parseFraction(text: string): number | null {
  const frac = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const plain = text.match(/^(\d+(?:\.\d+)?)/);
  return plain ? Number(plain[1]) : null;
}

/** Deterministic amount → mass range. Returns null when no mass is derivable
 *  (the line is then I7-unmapped for View 9 totals). */
export function ingredientMassGrams(
  canonicalName: string,
  amountText: string | null,
  quantity: number | null,
  unit: string | null,
): [number, number] | null {
  const defaults = DEFAULT_MASS[canonicalName];
  if (quantity != null && unit != null) {
    const lower = unit.toLowerCase();
    if (lower === 'g') return [quantity, quantity];
    if (lower === 'kg') return [quantity * 1000, quantity * 1000];
  }
  const words = amountText ? amountText.trim().toLowerCase() : '';
  // fraction FIRST: '1/2 nos' must not match as plain '1' + no unit.
  const match = words.match(/^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*([a-z]+)?/);
  if (match) {
    const n = parseFraction(match[1]);
    const unitToken = match[2] ?? '';
    if (n !== null) {
      if (unitToken === 'kg') return [n * 1000, n * 1000];
      if (unitToken === 'g') return [n, n];
      if (unitToken === 'nos' && defaults?.nos_g !== undefined) {
        return [n * defaults.nos_g, n * defaults.nos_g];
      }
      if (unitToken === 'tsp' && defaults?.tsp_g !== undefined) {
        return [n * defaults.tsp_g, n * defaults.tsp_g];
      }
      if (unitToken === 'tbsp' && defaults?.tsp_g !== undefined) {
        return [n * defaults.tsp_g * 3, n * defaults.tsp_g * 3];
      }
      if (!unitToken && defaults?.default_g) return [n, n];
    }
  }
  if (defaults?.default_g) return defaults.default_g;
  return null;
}

interface CompositionValue {
  energy_kcal_per_100g: number | null;
  protein_g_per_100g: number | null;
  fat_g_per_100g: number | null;
  carb_g_per_100g: number | null;
  fibre_g_per_100g: number | null;
}

interface CompositionEntryView {
  entryId: string;
  isPrimary: boolean;
  version: CompositionValue | null;
}

async function loadComposition(
  prisma: PrismaClient,
  dictionaryIds: string[],
): Promise<Map<string, CompositionEntryView[]>> {
  if (dictionaryIds.length === 0) return new Map();
  const asOf = new Date();
  const entries = await prisma.nutritionFoodCompositionEntry.findMany({
    where: { ingredientId: { in: dictionaryIds } },
    include: {
      versions: {
        where: {
          effectiveFrom: { lte: asOf },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
        },
        orderBy: { effectiveFrom: 'desc' },
        take: 1,
      },
    },
  });
  const byIngredient = new Map<string, CompositionEntryView[]>();
  for (const entry of entries) {
    const version = entry.versions[0] ?? null;
    const list = byIngredient.get(entry.ingredientId) ?? [];
    list.push({
      entryId: entry.id,
      isPrimary: entry.isPrimaryForIngredient,
      version: version
        ? {
            energy_kcal_per_100g: version.energyKcalPer100g?.toNumber() ?? null,
            protein_g_per_100g: version.proteinGPer100g?.toNumber() ?? null,
            fat_g_per_100g: version.fatGPer100g?.toNumber() ?? null,
            carb_g_per_100g: version.carbGPer100g?.toNumber() ?? null,
            fibre_g_per_100g: version.fiberGPer100g?.toNumber() ?? null,
          }
        : null,
    });
    byIngredient.set(entry.ingredientId, list);
  }
  return byIngredient;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function computeView9(
  prisma: PrismaClient,
  captured: StructuredRecipeInput,
  overrides: View9Overrides = DEFAULT_OVERRIDES,
): Promise<View9Payload> {
  const ingredients = captured.structured_recipe.ingredients;
  const resolved = await resolveIngredients(prisma, ingredients);
  const dictionaryIds = resolved
    .map((r) => r.dictionary_id)
    .filter((id): id is string => id !== null);
  const composition = await loadComposition(prisma, dictionaryIds);

  let energyMin = 0;
  let energyMax = 0;
  let proteinMin = 0;
  let proteinMax = 0;
  let fatMin = 0;
  let fatMax = 0;
  let carbMin = 0;
  let carbMax = 0;
  let fibreMin = 0;
  let fibreMax = 0;

  const unmapped: string[] = [];

  for (const ingredient of resolved) {
    if (!ingredient.dictionary_id || !ingredient.canonical_name) {
      unmapped.push(ingredient.display_name);
      continue;
    }
    const mass = ingredientMassGrams(
      ingredient.canonical_name,
      ingredient.amount_text,
      ingredient.quantity,
      ingredient.unit,
    );
    if (mass === null) {
      unmapped.push(ingredient.display_name);
      continue;
    }
    const entries = composition.get(ingredient.dictionary_id) ?? [];
    const usable = entries.filter((e) => e.version !== null);
    if (usable.length === 0) {
      unmapped.push(ingredient.display_name);
      continue;
    }
    const primary = usable.find((e) => e.isPrimary);
    const selected = primary ?? usable[0];

    const scale = (value: number | null): [number, number] => {
      const per100 = value ?? 0;
      return [per100 * (mass[0] / 100), per100 * (mass[1] / 100)];
    };

    if (ingredient.canonical_name === 'fish') {
      // species-unknown band: lean end = lowest-kcal entry, oily end = highest.
      const energies = usable
        .map((e) => e.version?.energy_kcal_per_100g ?? null)
        .filter((v): v is number => v !== null);
      const leanKcal = energies.length > 0 ? Math.min(...energies) : null;
      const oilyKcal = energies.length > 0 ? Math.max(...energies) : null;
      const leanEntry = usable.find((e) => e.version?.energy_kcal_per_100g === leanKcal);
      const oilyEntry = usable.find((e) => e.version?.energy_kcal_per_100g === oilyKcal);
      const fishMass = mass[0]; // 500g — the card's own quantity
      const totals = (entry: CompositionEntryView | undefined): number[] | null => {
        const v = entry?.version;
        if (!v) return null;
        return [
          (v.energy_kcal_per_100g ?? 0) * (fishMass / 100),
          (v.protein_g_per_100g ?? 0) * (fishMass / 100),
          (v.fat_g_per_100g ?? 0) * (fishMass / 100),
          (v.carb_g_per_100g ?? 0) * (fishMass / 100),
          (v.fibre_g_per_100g ?? 0) * (fishMass / 100),
        ];
      };
      const leanTotals = totals(leanEntry);
      const oilyTotals = totals(oilyEntry);
      const addTo = (minSide: number[] | null, maxSide: number[] | null): void => {
        energyMin += minSide?.[0] ?? 0;
        proteinMin += minSide?.[1] ?? 0;
        fatMin += minSide?.[2] ?? 0;
        carbMin += minSide?.[3] ?? 0;
        fibreMin += minSide?.[4] ?? 0;
        energyMax += maxSide?.[0] ?? 0;
        proteinMax += maxSide?.[1] ?? 0;
        fatMax += maxSide?.[2] ?? 0;
        carbMax += maxSide?.[3] ?? 0;
        fibreMax += maxSide?.[4] ?? 0;
      };
      if (overrides.fish_class === 'both') {
        addTo(leanTotals, oilyTotals);
      } else if (overrides.fish_class === 'lean') {
        addTo(leanTotals, leanTotals);
      } else {
        addTo(oilyTotals, oilyTotals);
      }
      continue;
    }

    // coconut levers honor the I2 overrides.
    if (ingredient.canonical_name === 'coconut_flesh') {
      const version = selected.version;
      const add = (value: number | null): [number, number] => {
        const per100 = value ?? 0;
        return [
          (per100 * overrides.coconut_grams[0]) / 100,
          (per100 * overrides.coconut_grams[1]) / 100,
        ];
      };
      const e = add(version?.energy_kcal_per_100g ?? null);
      const p = add(version?.protein_g_per_100g ?? null);
      const f = add(version?.fat_g_per_100g ?? null);
      const c = add(version?.carb_g_per_100g ?? null);
      const fi = add(version?.fibre_g_per_100g ?? null);
      energyMin += e[0]; energyMax += e[1];
      proteinMin += p[0]; proteinMax += p[1];
      fatMin += f[0]; fatMax += f[1];
      carbMin += c[0]; carbMax += c[1];
      fibreMin += fi[0]; fibreMax += fi[1];
      continue;
    }

    if (ingredient.canonical_name === 'coconut_oil') {
      const version = selected.version;
      const oilGrams: [number, number] = [
        overrides.oil_tbsp[0] * 14,
        overrides.oil_tbsp[1] * 14,
      ];
      const add = (value: number | null): [number, number] => {
        const per100 = value ?? 0;
        return [(per100 * oilGrams[0]) / 100, (per100 * oilGrams[1]) / 100];
      };
      const e = add(version?.energy_kcal_per_100g ?? null);
      const p = add(version?.protein_g_per_100g ?? null);
      const f = add(version?.fat_g_per_100g ?? null);
      const c = add(version?.carb_g_per_100g ?? null);
      const fi = add(version?.fibre_g_per_100g ?? null);
      energyMin += e[0]; energyMax += e[1];
      proteinMin += p[0]; proteinMax += p[1];
      fatMin += f[0]; fatMax += f[1];
      carbMin += c[0]; carbMax += c[1];
      fibreMin += fi[0]; fibreMax += fi[1];
      continue;
    }

    const e = scale(selected.version?.energy_kcal_per_100g ?? null);
    const p = scale(selected.version?.protein_g_per_100g ?? null);
    const f = scale(selected.version?.fat_g_per_100g ?? null);
    const c = scale(selected.version?.carb_g_per_100g ?? null);
    const fi = scale(selected.version?.fibre_g_per_100g ?? null);
    energyMin += e[0]; energyMax += e[1];
    proteinMin += p[0]; proteinMax += p[1];
    fatMin += f[0]; fatMax += f[1];
    carbMin += c[0]; carbMax += c[1];
    fibreMin += fi[0]; fibreMax += fi[1];
  }

  const assumptions: View9Payload['assumptions'] = [
    {
      key: 'fish_class',
      value:
        overrides.fish_class === 'both' ? 'lean-to-oily (species unknown)' : overrides.fish_class,
      tag: 'ASSUMED',
    },
    {
      key: 'coconut_grams',
      value:
        overrides.coconut_grams[0] === overrides.coconut_grams[1]
          ? overrides.coconut_grams[0]
          : `${overrides.coconut_grams[0]}–${overrides.coconut_grams[1]}`,
      tag: 'ASSUMED',
    },
    {
      key: 'oil_tbsp',
      value:
        overrides.oil_tbsp[0] === overrides.oil_tbsp[1]
          ? overrides.oil_tbsp[0]
          : `${overrides.oil_tbsp[0]}–${overrides.oil_tbsp[1]}`,
      tag: 'ASSUMED',
    },
    // I7: unmapped lines are EXCLUDED from totals and LISTED here (the frozen
    // View 9 payload has no dedicated unmapped field — D-19 carries the listing
    // as ASSUMED-tagged assumption entries; recorded in HANDOFF §5).
    ...unmapped.map((name) => ({
      key: 'unmapped_ingredient',
      value: name,
      tag: 'ASSUMED' as const,
    })),
  ];

  return {
    band: {
      energy_kcal_min: Math.round(energyMin),
      energy_kcal_max: Math.round(energyMax),
      protein_g: { min: round1(proteinMin), max: round1(proteinMax) },
      fat_g: { min: round1(fatMin), max: round1(fatMax) },
      carb_g: { min: round1(carbMin), max: round1(carbMax) },
      fibre_g: { min: round1(fibreMin), max: round1(fibreMax) },
    },
    sodium: 'unknown',
    assumptions,
    per_portion: null,
    tightening_factors: ['Name the fish species', 'Weigh the coconut', 'Measure the tadka oil'],
    disclaimer: I6_DISCLAIMER,
  };
}

/** Extract the persisted overrides from a stored View 9 payload. */
export function overridesFromPayload(payload: unknown): View9Overrides {
  const out: View9Overrides = { ...DEFAULT_OVERRIDES };
  if (!payload || typeof payload !== 'object') return out;
  const assumptions = Array.isArray((payload as { assumptions?: unknown }).assumptions)
    ? ((payload as { assumptions: Array<{ key?: string; value?: string | number }> }).assumptions)
    : [];
  for (const item of assumptions) {
    if (item.key === 'fish_class') {
      if (item.value === 'lean') out.fish_class = 'lean';
      else if (item.value === 'oily') out.fish_class = 'oily';
    }
    if (item.key === 'coconut_grams' && typeof item.value === 'number') {
      out.coconut_grams = [item.value, item.value];
    }
    if (item.key === 'oil_tbsp' && typeof item.value === 'number') {
      out.oil_tbsp = [item.value, item.value];
    }
  }
  return out;
}

/** Merge an RS-US-45 delta onto the persisted overrides (worker-side). */
export function mergeOverrides(
  current: View9Overrides,
  delta: View9AssumptionDelta,
): View9Overrides {
  return {
    fish_class: delta.fish_class ?? current.fish_class,
    coconut_grams:
      delta.coconut_grams !== undefined ? [delta.coconut_grams, delta.coconut_grams] : current.coconut_grams,
    oil_tbsp: delta.oil_tbsp !== undefined ? [delta.oil_tbsp, delta.oil_tbsp] : current.oil_tbsp,
  };
}
