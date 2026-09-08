import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../generated/index.js';

// Canonical ERD v13 table set — the 24 tables D-02 materializes (ERD_FINAL.md §3).
// This test is a schema-fidelity gate: the datamodel must model exactly these, no more, no fewer.
const CANONICAL_TABLES = [
  'account',
  'account_restriction_profile',
  'account_restriction_item',
  'guest_session',
  'recipe',
  'recipe_input',
  'recipe_ingredient_line',
  'recipe_tag',
  'ingredient_dictionary',
  'ingredient_alias',
  'analysis',
  'analysis_view',
  'analysis_claim',
  'analysis_station_card',
  'shopping_list_generation',
  'shopping_list_item',
  'ingredient_shopping_state',
  'cook_log',
  'cook_log_swap',
  'cook_log_photo',
  'dietary_allergen_definition',
  'dietary_allergen_mapping',
  'nutrition_food_composition_entry',
  'nutrition_food_composition_version',
];

describe('ERD v13 schema fidelity', () => {
  it('models exactly the 24 canonical tables', () => {
    const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);
    const mapped = CANONICAL_TABLES.map((t) => {
      const model = t
        .split('_')
        .map((s) => s[0].toUpperCase() + s.slice(1))
        .join('');
      return { table: t, model, present: models.includes(model) };
    });
    const missing = mapped.filter((m) => !m.present);
    expect(missing).toEqual([]);
    const extras = models.filter((m) => !mapped.some((x) => x.model === m));
    expect(extras).toEqual([]);
    expect(models.length).toBe(24);
  });

  it('constructs a Prisma client', () => {
    const client = new PrismaClient();
    expect(client).toBeDefined();
    return client.$disconnect();
  });

  it('exposes the canonical model delegates', () => {
    const client = new PrismaClient();
    for (const t of CANONICAL_TABLES) {
      const delegate = (client as unknown as Record<string, unknown>)[
        t.split('_')
          .map((s, i) => (i === 0 ? s[0].toLowerCase() + s.slice(1) : s[0].toUpperCase() + s.slice(1)))
          .join('')
      ];
      expect(delegate).toBeDefined();
    }
    return client.$disconnect();
  });
});
