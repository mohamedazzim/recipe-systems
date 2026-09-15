import { BadRequestException } from '@nestjs/common';
import {
  RestrictionHighlightController,
  RestrictionProfileController,
  RestrictionVocabularyController,
} from './restriction.controller';

const req = { user: { accountId: 'acc-1', email: 'chef@test.dev', sub: 's1' } } as never;

function mockService() {
  return {
    getProfile: jest.fn().mockResolvedValue({
      profile_id: 'prof-1',
      allergens: ['fish'],
      diet_patterns: ['vegetarian'],
      label_pack: 'EU',
    }),
    putProfile: jest.fn().mockResolvedValue({
      profile_id: 'prof-1',
      allergens: ['fish'],
      diet_patterns: ['vegetarian'],
      label_pack: 'EU',
    }),
    vocabulary: jest.fn().mockResolvedValue({
      allergens: [{ code: 'fish', name: 'Fish', label_pack: 'both' }],
      diet_patterns: ['vegetarian', 'vegan', 'gluten-free'],
    }),
    highlight: jest.fn().mockResolvedValue({
      conflicts: ['Fish'],
      unknown: [],
      not_flagged: [],
      profile_notes: [],
    }),
  };
}

describe('RestrictionProfileController (D-26 H1)', () => {
  it('GET forwards the account profile wire', async () => {
    const svc = mockService();
    const controller = new RestrictionProfileController(svc as never);
    const out = await controller.getProfile(req);
    expect(svc.getProfile).toHaveBeenCalledWith('acc-1');
    expect(out.profile_id).toBe('prof-1');
  });

  it('PUT accepts the canonical body and forwards it', async () => {
    const svc = mockService();
    const controller = new RestrictionProfileController(svc as never);
    const out = await controller.putProfile(req, {
      allergens: ['fish'],
      diet_patterns: ['vegetarian'],
      label_pack: 'EU',
    });
    expect(svc.putProfile).toHaveBeenCalledWith('acc-1', {
      allergens: ['fish'],
      dietPatterns: ['vegetarian'],
      labelPack: 'EU',
    });
    expect(out.label_pack).toBe('EU');
  });

  it('PUT refuses non-canonical bodies (400 INVALID_RESTRICTION_PROFILE)', async () => {
    const svc = mockService();
    const controller = new RestrictionProfileController(svc as never);
    for (const body of [
      { allergens: ['fish'], diet_patterns: ['keto'], label_pack: 'EU' }, // not the pilot vocabulary
      { allergens: ['fish'], diet_patterns: [], label_pack: 'FR' }, // not US|EU
      { allergens: [42], diet_patterns: [], label_pack: 'US' },
      { allergens: [], diet_patterns: [], label_pack: 'US', extra: true },
      {},
    ]) {
      await expect(controller.putProfile(req, body)).rejects.toMatchObject({
        constructor: BadRequestException,
        response: { code: 'INVALID_RESTRICTION_PROFILE' },
      });
    }
    expect(svc.putProfile).not.toHaveBeenCalled();
  });
});

describe('RestrictionVocabularyController (D-26 H1 UI)', () => {
  it('returns the canonical vocabulary', async () => {
    const svc = mockService();
    const controller = new RestrictionVocabularyController(svc as never);
    const out = await controller.vocabulary();
    expect(out.allergens).toHaveLength(1);
  });
});

describe('RestrictionHighlightController (D-26 H3)', () => {
  it('forwards the analysis id with the bearer actor', async () => {
    const svc = mockService();
    const controller = new RestrictionHighlightController(svc as never);
    const out = await controller.highlight(req, 'analysis-1');
    expect(svc.highlight).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user' }),
      'analysis-1',
    );
    expect(out.conflicts).toEqual(['Fish']);
  });
});
