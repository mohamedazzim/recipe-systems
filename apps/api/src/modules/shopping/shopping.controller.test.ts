// D-30 (Track S) — ShoppingController boundary tests (schema validation +
// delegation). Guards are covered by the shared guard suites; ownership by the
// ShoppingService/RecipeService suites.

import { BadRequestException } from '@nestjs/common';
import { ActorRequest } from '../../common/guards/guest-or-jwt.guard';
import { ShoppingController } from './shopping.controller';
import { ShoppingService } from './shopping.service';

function controller() {
  const shopping = {
    generate: jest.fn(async () => ({ generated: true })),
    latest: jest.fn(async () => ({ latest: true })),
    setState: jest.fn(async () => ({ set: true })),
  } as unknown as ShoppingService;
  return { c: new ShoppingController(shopping), shopping };
}

const REQ = {
  actor: { kind: 'user', user: { accountId: 'a', email: 'e@e.e' } },
} as unknown as ActorRequest;

describe('ShoppingController (D-30)', () => {
  it('POST generate delegates with the actor + recipe id', async () => {
    const { c, shopping } = controller();
    await c.generate(REQ, 'recipe-1');
    expect(shopping.generate).toHaveBeenCalledWith(REQ.actor, 'recipe-1');
  });

  it('GET latest delegates', async () => {
    const { c, shopping } = controller();
    await c.latest(REQ, 'recipe-1');
    expect(shopping.latest).toHaveBeenCalledWith(REQ.actor, 'recipe-1');
  });

  it('PATCH setState accepts have/need with a UUID key', async () => {
    const { c, shopping } = controller();
    const out = await c.setState(
      REQ,
      'recipe-1',
      { shopping_key: 'aaaa0000-0000-0000-0000-000000000001', state: 'have' },
    );
    expect(out).toEqual({ set: true });
    expect(shopping.setState).toHaveBeenCalledWith(REQ.actor, 'recipe-1', {
      shopping_key: 'aaaa0000-0000-0000-0000-000000000001',
      state: 'have',
    });
  });

  it('PATCH setState rejects malformed bodies with 400 INVALID_SHOPPING_STATE', async () => {
    const { c, shopping } = controller();
    await expect(c.setState(REQ, 'recipe-1', { shopping_key: 'nope', state: 'maybe' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(c.setState(REQ, 'recipe-1', { state: 'have' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      c.setState(REQ, 'recipe-1', { shopping_key: 'aaaa0000-0000-0000-0000-000000000001', state: 'have', extra: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(shopping.setState).not.toHaveBeenCalled();
  });
});
