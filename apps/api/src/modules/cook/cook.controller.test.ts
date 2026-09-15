import { BadRequestException } from '@nestjs/common';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';
import { CookController, CookLogController } from './cook.controller';

const RECIPE_ID = '11111111-1111-4111-8111-111111111111';
const LOG_ID = '22222222-2222-4222-8222-222222222222';

const userActor: Actor = {
  kind: 'user',
  user: { accountId: 'acc-1', email: 'chef@test.dev', sub: 's1' },
};

function wire(overrides: Record<string, unknown> = {}) {
  return {
    cook_log_id: LOG_ID,
    recipe_id: RECIPE_ID,
    cook_date: '2026-09-12',
    rating: 4,
    note: '2 green chillies, fenugreek powder off heat',
    next_time: null,
    created_at: '2026-09-12T10:00:00.000Z',
    ...overrides,
  };
}

function mockCook() {
  return {
    logCook: jest.fn().mockResolvedValue(wire()),
    listCookLogs: jest.fn().mockResolvedValue([wire()]),
    lastCook: jest.fn().mockResolvedValue({
      last_cooked_at: '2026-09-12',
      rating: 4,
      next_time: null,
    }),
    updateCookLog: jest.fn().mockResolvedValue(wire({ rating: 5 })),
  };
}

describe('CookController (D-24 HTTP boundary)', () => {
  it('POST /recipes/:recipeId/cook-logs accepts the canonical body and trims the note', async () => {
    const svc = mockCook();
    const controller = new CookController(svc as any);
    const out = await controller.logCook(
      { actor: userActor } as any,
      RECIPE_ID,
      { cook_date: '2026-09-12', rating: 4, note: '  fish held  ' },
    );
    expect(svc.logCook).toHaveBeenCalledWith(userActor, RECIPE_ID, {
      cookDate: '2026-09-12',
      rating: 4,
      note: 'fish held',
    });
    expect(out.cook_log_id).toBe(LOG_ID);
  });

  it('POST accepts omitted cook_date and blank rating/note (both optional — F1 TC-01, F2 TC-02)', async () => {
    const svc = mockCook();
    const controller = new CookController(svc as any);
    await controller.logCook({ actor: userActor } as any, RECIPE_ID, {});
    expect(svc.logCook).toHaveBeenCalledWith(userActor, RECIPE_ID, {
      cookDate: undefined,
      rating: null,
      note: null,
    });
    await controller.logCook({ actor: userActor } as any, RECIPE_ID, {
      rating: null,
      note: '   ',
    });
    expect(svc.logCook).toHaveBeenLastCalledWith(userActor, RECIPE_ID, {
      cookDate: undefined,
      rating: null,
      note: null,
    });
  });

  it('POST refuses non-canonical bodies at the boundary (400 INVALID_COOK_LOG)', async () => {
    const svc = mockCook();
    const controller = new CookController(svc as any);
    const badBodies = [
      { rating: 6 }, // out of range
      { rating: 0 },
      { rating: 1.5 },
      { cook_date: '14/09/2026' }, // wrong format
      { cook_date: '2026-02-31' }, // impossible calendar date
      { next_time: 'less chilli' }, // F4/D-26 — not this unit
      { swaps: [{ action: 'swapped' }] }, // F3/D-26 — not this unit
      { note: 42 }, // wrong type
      { rating: '4' }, // wrong type
    ];
    for (const body of badBodies) {
      await expect(controller.logCook({ actor: userActor } as any, RECIPE_ID, body)).rejects.toMatchObject({
        constructor: BadRequestException,
        response: { code: 'INVALID_COOK_LOG' },
      });
    }
    expect(svc.logCook).not.toHaveBeenCalled();
  });

  it('POST accepts the rating boundaries 1 and 5', async () => {
    const svc = mockCook();
    const controller = new CookController(svc as any);
    await controller.logCook({ actor: userActor } as any, RECIPE_ID, { rating: 1 });
    await controller.logCook({ actor: userActor } as any, RECIPE_ID, { rating: 5 });
    expect(svc.logCook).toHaveBeenCalledTimes(2);
  });

  it('GET /recipes/:recipeId/cook-logs wraps the wire in { items } (API §8)', async () => {
    const svc = mockCook();
    const controller = new CookController(svc as any);
    const out = await controller.listCookLogs({ actor: userActor } as any, RECIPE_ID);
    expect(svc.listCookLogs).toHaveBeenCalledWith(userActor, RECIPE_ID);
    expect(out).toEqual({ items: [wire()] });
  });

  it('GET /recipes/:recipeId/last-cook returns the F6 reopen summary', async () => {
    const svc = mockCook();
    const controller = new CookController(svc as any);
    const out = await controller.lastCook({ actor: userActor } as any, RECIPE_ID);
    expect(svc.lastCook).toHaveBeenCalledWith(userActor, RECIPE_ID);
    expect(out).toEqual({ last_cooked_at: '2026-09-12', rating: 4, next_time: null });
  });
});

describe('CookLogController (D-24 PATCH boundary)', () => {
  it('PATCH /cook-logs/:cookLogId forwards the RS-US-32 slice (rating/note)', async () => {
    const svc = mockCook();
    const controller = new CookLogController(svc as any);
    const out = await controller.updateCookLog(
      { actor: userActor } as any,
      LOG_ID,
      { rating: 5 },
    );
    expect(svc.updateCookLog).toHaveBeenCalledWith(userActor, LOG_ID, { rating: 5, note: undefined });
    expect(out.rating).toBe(5);
  });

  it('PATCH trims notes, converts blank notes to null clears, and passes explicit null through', async () => {
    const svc = mockCook();
    const controller = new CookLogController(svc as any);
    await controller.updateCookLog({ actor: userActor } as any, LOG_ID, { note: '  x  ' });
    expect(svc.updateCookLog).toHaveBeenLastCalledWith(userActor, LOG_ID, { rating: undefined, note: 'x' });
    await controller.updateCookLog({ actor: userActor } as any, LOG_ID, { note: '   ' });
    expect(svc.updateCookLog).toHaveBeenLastCalledWith(userActor, LOG_ID, { rating: undefined, note: null });
    await controller.updateCookLog({ actor: userActor } as any, LOG_ID, { note: null });
    expect(svc.updateCookLog).toHaveBeenLastCalledWith(userActor, LOG_ID, { rating: undefined, note: null });
  });

  it('PATCH refuses non-canonical fields (next_time is F4/D-26) with 400 INVALID_COOK_LOG', async () => {
    const svc = mockCook();
    const controller = new CookLogController(svc as any);
    for (const body of [
      { next_time: 'less chilli' },
      { rating: 6 },
      { cook_date: '2026-09-12' },
      { unknown: true },
    ]) {
      await expect(controller.updateCookLog({ actor: userActor } as any, LOG_ID, body)).rejects.toMatchObject({
        constructor: BadRequestException,
        response: { code: 'INVALID_COOK_LOG' },
      });
    }
    expect(svc.updateCookLog).not.toHaveBeenCalled();
  });

  it('PATCH with an empty body passes through as a canonical no-op', async () => {
    const svc = mockCook();
    const controller = new CookLogController(svc as any);
    await controller.updateCookLog({ actor: userActor } as any, LOG_ID, {});
    expect(svc.updateCookLog).toHaveBeenCalledWith(userActor, LOG_ID, {
      rating: undefined,
      note: undefined,
    });
  });
});
