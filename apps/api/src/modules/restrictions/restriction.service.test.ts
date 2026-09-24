import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { RestrictionService } from './restriction.service';

const ACCOUNT_ID = 'acc-1';
const ANALYSIS_ID = 'aaaa1111-1111-4111-8111-111111111111';
const FOREIGN_ANALYSIS = 'bbbb2222-2222-4222-8222-222222222222';

function mockPrisma() {
  return {
    accountRestrictionProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    accountRestrictionItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    dietaryAllergenDefinition: {
      findMany: jest.fn(),
    },
    analysis: { findUnique: jest.fn() },
    analysisView: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  };
}

const mockTx = {
  accountRestrictionProfile: { upsert: jest.fn() },
  accountRestrictionItem: { deleteMany: jest.fn(), createMany: jest.fn() },
};

const userActor: Actor = {
  kind: 'user',
  user: { accountId: ACCOUNT_ID, email: 'chef@test.dev', sub: 's1' },
};
const guestActor: Actor = { kind: 'guest', guestSessionId: 'gs-1', expiresAt: new Date() };

const FISH_DEF = { id: 'def-fish', code: 'fish', name: 'Fish', labelPack: 'both' };

describe('RestrictionService (D-26 H1/H3)', () => {
  it('getProfile is null-safe for a never-configured account (H1 TC-02)', async () => {
    const prisma: any = mockPrisma();
    prisma.accountRestrictionProfile.findUnique.mockResolvedValue(null);
    const svc = new RestrictionService(prisma);
    expect(await svc.getProfile(ACCOUNT_ID)).toEqual({
      profile_id: null,
      allergens: [],
      diet_patterns: [],
      label_pack: null,
    });
  });

  it('getProfile maps items to canonical codes and diet patterns', async () => {
    const prisma: any = mockPrisma();
    prisma.accountRestrictionProfile.findUnique.mockResolvedValue({
      id: 'prof-1',
      labelPack: 'EU',
      items: [
        { allergenId: 'def-fish', dietPattern: null },
        { allergenId: null, dietPattern: 'vegetarian' },
      ],
    });
    prisma.dietaryAllergenDefinition.findMany.mockResolvedValue([FISH_DEF]);
    const svc = new RestrictionService(prisma);
    expect(await svc.getProfile(ACCOUNT_ID)).toEqual({
      profile_id: 'prof-1',
      allergens: ['fish'],
      diet_patterns: ['vegetarian'],
      label_pack: 'EU',
    });
  });

  it('putProfile rejects unknown allergen codes (strict canonical validation, H1)', async () => {
    const prisma: any = mockPrisma();
    prisma.dietaryAllergenDefinition.findMany.mockResolvedValue([FISH_DEF]);
    const svc = new RestrictionService(prisma);
    await expect(
      svc.putProfile(ACCOUNT_ID, {
        allergens: ['fish', 'dragonfruit'],
        dietPatterns: [],
        labelPack: 'US',
      }),
    ).rejects.toMatchObject({
      constructor: BadRequestException,
      response: { code: 'INVALID_RESTRICTION_PROFILE' },
    });
  });

  it('putProfile upserts the profile and REPLACES items (allergen + diet_pattern rows)', async () => {
    const prisma: any = mockPrisma();
    prisma.dietaryAllergenDefinition.findMany.mockResolvedValue([FISH_DEF]);
    mockTx.accountRestrictionProfile.upsert.mockResolvedValue({ id: 'prof-1', labelPack: 'US' });
    prisma.accountRestrictionProfile.findUnique.mockResolvedValue({
      id: 'prof-1',
      labelPack: 'US',
      items: [
        { allergenId: 'def-fish', dietPattern: null },
        { allergenId: null, dietPattern: 'gluten-free' },
      ],
    });
    prisma.dietaryAllergenDefinition.findMany
      .mockResolvedValueOnce([FISH_DEF]) // the validation call
      .mockResolvedValueOnce([FISH_DEF]); // the getProfile mapping call
    const svc = new RestrictionService(prisma);
    const wire = await svc.putProfile(ACCOUNT_ID, {
      allergens: ['fish'],
      dietPatterns: ['gluten-free'],
      labelPack: 'US',
    });
    expect(mockTx.accountRestrictionProfile.upsert).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
      create: { accountId: ACCOUNT_ID, labelPack: 'US' },
      update: { labelPack: 'US' },
    });
    expect(mockTx.accountRestrictionItem.deleteMany).toHaveBeenCalledWith({
      where: { restrictionProfileId: 'prof-1' },
    });
    expect(mockTx.accountRestrictionItem.createMany).toHaveBeenCalledWith({
      data: [
        { restrictionProfileId: 'prof-1', allergenId: 'def-fish', dietPattern: null, restrictionType: 'allergen' },
        { restrictionProfileId: 'prof-1', allergenId: null, dietPattern: 'gluten-free', restrictionType: 'diet_pattern' },
      ],
    });
    expect(wire.allergens).toEqual(['fish']);
    expect(wire.diet_patterns).toEqual(['gluten-free']);
    expect(wire.label_pack).toBe('US');
  });

  it('vocabulary returns the canonical allergen codes + the labeled pilot diet patterns', async () => {
    const prisma: any = mockPrisma();
    prisma.dietaryAllergenDefinition.findMany.mockResolvedValue([
      { code: 'fish', name: 'Fish', labelPack: 'both' },
    ]);
    const svc = new RestrictionService(prisma);
    const wire = await svc.vocabulary();
    expect(wire.allergens).toEqual([{ code: 'fish', name: 'Fish', label_pack: 'both' }]);
    expect(wire.diet_patterns).toEqual(['vegetarian', 'vegan', 'gluten-free']);
  });

  it('highlight: conflicts FIRST, unknown never a pass, not_flagged carries no pass claim (H3)', async () => {
    const prisma: any = mockPrisma();
    prisma.analysis.findUnique.mockResolvedValue({
      id: ANALYSIS_ID,
      recipe: { accountId: ACCOUNT_ID, guestSessionId: null },
    });
    prisma.analysisView.findFirst.mockResolvedValue({
      payload: {
        present: ['Fish', 'Mustard'],
        not_on_card: ['Coconut'],
        unknown: ['Peanut'],
        removal_notes: [],
        disclaimer: 'Reads the card only.',
        allergen_line: { contains: [], notes: [], unknown: [] },
      },
    });
    prisma.accountRestrictionProfile.findUnique.mockResolvedValue({
      id: 'prof-1',
      labelPack: 'US',
      items: [
        { allergenId: 'def-fish', dietPattern: null }, // → conflict (present)
        { allergenId: 'def-peanut', dietPattern: null }, // → unknown (never a pass)
        { allergenId: 'def-shellfish', dietPattern: null }, // → not_flagged (no pass claim)
        { allergenId: null, dietPattern: 'vegan' }, // → profile note
      ],
    });
    prisma.dietaryAllergenDefinition.findMany.mockResolvedValue([
      { name: 'Fish' },
      { name: 'Peanut' },
      { name: 'Shellfish' },
    ]);
    const svc = new RestrictionService(prisma);
    const wire = await svc.highlight(userActor, ANALYSIS_ID);
    expect(wire.conflicts).toEqual(['Fish']);
    expect(wire.unknown).toEqual(['Peanut']);
    expect(wire.not_flagged).toEqual(['Shellfish']);
    expect(wire.profile_notes.some((n) => n.includes('vegan'))).toBe(true);
    expect(wire.profile_notes.some((n) => n.includes('label pack: US'))).toBe(true);
  });

  it('highlight: missing and FOREIGN analyses are canonical 404s; guests get an empty highlight', async () => {
    const prisma: any = mockPrisma();
    prisma.analysis.findUnique.mockResolvedValue(null);
    const svc = new RestrictionService(prisma);
    await expect(svc.highlight(userActor, 'not-a-uuid')).rejects.toMatchObject({
      constructor: NotFoundException,
      response: { code: 'ANALYSIS_NOT_FOUND' },
    });

    prisma.analysis.findUnique.mockResolvedValue({
      id: FOREIGN_ANALYSIS,
      recipe: { accountId: 'acc-OTHER', guestSessionId: null },
    });
    await expect(svc.highlight(userActor, FOREIGN_ANALYSIS)).rejects.toMatchObject({
      constructor: NotFoundException,
      response: { code: 'ANALYSIS_NOT_FOUND' },
    });

    prisma.analysis.findUnique.mockResolvedValue({
      id: ANALYSIS_ID,
      recipe: { accountId: null, guestSessionId: 'gs-1' },
    });
    expect(await svc.highlight(guestActor, ANALYSIS_ID)).toEqual({
      conflicts: [],
      unknown: [],
      not_flagged: [],
      profile_notes: [],
      unavailable: false,
    });
  });

  it('highlight: no profile → empty result, no banner (nothing to evaluate)', async () => {
    const prisma: any = mockPrisma();
    prisma.analysis.findUnique.mockResolvedValue({
      id: ANALYSIS_ID,
      recipe: { accountId: ACCOUNT_ID, guestSessionId: null },
    });
    prisma.accountRestrictionProfile.findUnique.mockResolvedValue(null);
    prisma.analysisView.findFirst.mockResolvedValue(null);
    const svc = new RestrictionService(prisma);
    expect(await svc.highlight(userActor, ANALYSIS_ID)).toEqual({
      conflicts: [],
      unknown: [],
      not_flagged: [],
      profile_notes: [],
      unavailable: false,
    });
  });

  it('BUG-023: an unusable allergen view can never read as an all-clear', async () => {
    // Pre-fix behaviour: a configured profile plus an unusable View 8 left `present`
    // and `unknown` EMPTY, so `not_flagged` swallowed every configured allergen — a
    // clean bill of health on an allergy surface, produced by data that simply was
    // not there. This test previously ENSHRINED that ("invalid View 8 payload →
    // empty sets"); it now asserts the opposite.
    const validView8 = {
      present: ['Fish'],
      not_on_card: [],
      unknown: [],
      removal_notes: [],
      disclaimer: 'Reads the card only.',
      allergen_line: { contains: [], notes: [], unknown: [] },
    };
    const cases: Array<{ name: string; row: { status: string; payload: unknown } | null }> = [
      { name: 'no analysis_view row at all', row: null },
      { name: 'schema-invalid payload (frozen gate rejects it)', row: { status: 'COMPLETE', payload: { bogus: true } } },
      {
        name: 'INCOMPLETE row still holding a parseable payload',
        row: { status: 'INCOMPLETE', payload: validView8 },
      },
    ];

    for (const { name, row } of cases) {
      const prisma: any = mockPrisma();
      prisma.analysis.findUnique.mockResolvedValue({
        id: ANALYSIS_ID,
        recipe: { accountId: ACCOUNT_ID, guestSessionId: null },
      });
      prisma.accountRestrictionProfile.findUnique.mockResolvedValue({
        id: 'prof-1',
        labelPack: 'US',
        items: [{ allergenId: 'def-shellfish', dietPattern: null }],
      });
      prisma.dietaryAllergenDefinition.findMany.mockResolvedValue([{ name: 'Shellfish' }]);
      // The double models a real database: the row exists, and it is excluded only
      // when the reader actually asks for COMPLETE rows. Drop that filter from the
      // reader and the third case fails.
      prisma.analysisView.findFirst.mockImplementation(async ({ where }: any) =>
        row && row.status === where.status ? { payload: row.payload } : null,
      );

      const svc = new RestrictionService(prisma);
      const wire = await svc.highlight(userActor, ANALYSIS_ID);

      // Never an all-clear…
      expect(wire.not_flagged).toEqual([]);
      // …the configured allergen is reported as unknown instead…
      expect(wire.unknown).toEqual(['Shellfish']);
      // …and the gap is stated explicitly, as an inline banner rather than a throw.
      expect(wire.unavailable).toBe(true);
      expect(wire.profile_notes.some((n) => n.includes('allergen check unavailable'))).toBe(true);
      expect(name.length).toBeGreaterThan(0); // identifies the failing case
    }
  });
});
