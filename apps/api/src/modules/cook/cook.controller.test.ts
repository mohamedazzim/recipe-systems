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
    attachPlatePhoto: jest.fn().mockResolvedValue({
      cook_log_id: LOG_ID,
      photo_uri: 's3://recipe-assets/cook/2222.jpg',
    }),
    platePhoto: jest.fn().mockResolvedValue({
      cook_log_id: LOG_ID,
      photo_uri: 's3://recipe-assets/cook/2222.jpg',
    }),
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
      nextTime: null,
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
      nextTime: null,
    });
    await controller.logCook({ actor: userActor } as any, RECIPE_ID, {
      rating: null,
      note: '   ',
    });
    expect(svc.logCook).toHaveBeenLastCalledWith(userActor, RECIPE_ID, {
      cookDate: undefined,
      rating: null,
      note: null,
      nextTime: null,
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
      { swaps: [{ action: 'swapped' }] }, // swaps ride POST /cook-logs/:cookLogId/swaps
      { note: 42 }, // wrong type
      { rating: '4' }, // wrong type
      { next_time: 42 }, // wrong type
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
    expect(svc.updateCookLog).toHaveBeenCalledWith(userActor, LOG_ID, {
      rating: 5,
      note: undefined,
      nextTime: undefined,
    });
    expect(out.rating).toBe(5);
  });

  it('PATCH trims notes, converts blank notes to null clears, and passes explicit null through', async () => {
    const svc = mockCook();
    const controller = new CookLogController(svc as any);
    await controller.updateCookLog({ actor: userActor } as any, LOG_ID, { note: '  x  ' });
    expect(svc.updateCookLog).toHaveBeenLastCalledWith(userActor, LOG_ID, {
      rating: undefined,
      note: 'x',
      nextTime: undefined,
    });
    await controller.updateCookLog({ actor: userActor } as any, LOG_ID, { note: '   ' });
    expect(svc.updateCookLog).toHaveBeenLastCalledWith(userActor, LOG_ID, {
      rating: undefined,
      note: null,
      nextTime: undefined,
    });
    await controller.updateCookLog({ actor: userActor } as any, LOG_ID, { note: null });
    expect(svc.updateCookLog).toHaveBeenLastCalledWith(userActor, LOG_ID, {
      rating: undefined,
      note: null,
      nextTime: undefined,
    });
  });

  it('PATCH forwards the F4 next-time edit (RS-US-34, D-26) with trim + null clear', async () => {
    const svc = mockCook();
    const controller = new CookLogController(svc as any);
    await controller.updateCookLog({ actor: userActor } as any, LOG_ID, { next_time: '  less chilli  ' });
    expect(svc.updateCookLog).toHaveBeenLastCalledWith(userActor, LOG_ID, {
      rating: undefined,
      note: undefined,
      nextTime: 'less chilli',
    });
    await controller.updateCookLog({ actor: userActor } as any, LOG_ID, { next_time: null });
    expect(svc.updateCookLog).toHaveBeenLastCalledWith(userActor, LOG_ID, {
      rating: undefined,
      note: undefined,
      nextTime: null,
    });
  });

  it('PATCH refuses non-canonical fields with 400 INVALID_COOK_LOG', async () => {
    const svc = mockCook();
    const controller = new CookLogController(svc as any);
    for (const body of [
      { rating: 6 },
      { cook_date: '2026-09-12' },
      { unknown: true },
      { swaps: [] },
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
      nextTime: undefined,
    });
  });

  describe('POST /cook-logs/:cookLogId/swaps (D-26 F3/H5)', () => {
    it('forwards the canonical swap body (201 + wire)', async () => {
      const svc = {
        ...mockCook(),
        recordSwap: jest.fn().mockResolvedValue({
          swap_id: 's1',
          cook_log_id: LOG_ID,
          line_id: null,
          ingredient_name_snapshot: 'Chilli',
          action: 'reduced',
          swapped_to: '3 Nos',
          reason: 'restriction',
          applied_to_card: false,
          created_at: '2026-09-12T11:00:00.000Z',
        }),
      };
      const controller = new CookLogController(svc as any);
      const out = await controller.recordSwap({ actor: userActor } as any, LOG_ID, {
        action: 'reduced',
        swapped_to: '3 Nos',
        reason: 'restriction',
        applied_to_card: false,
      });
      expect(svc.recordSwap).toHaveBeenCalledWith(userActor, LOG_ID, {
        lineId: undefined,
        action: 'reduced',
        swappedTo: '3 Nos',
        reason: 'restriction',
        appliedToCard: false,
      });
      expect(out.swap_id).toBe('s1');
    });

    it('refuses non-canonical swap bodies (400 INVALID_SWAP)', async () => {
      const svc = { ...mockCook(), recordSwap: jest.fn() };
      const controller = new CookLogController(svc as any);
      for (const body of [
        { action: 'changed' }, // not a canonical record type
        { action: 'swapped', swapped_to: 42 },
        { action: 'skipped', unknown: true },
        {},
      ]) {
        await expect(controller.recordSwap({ actor: userActor } as any, LOG_ID, body)).rejects.toMatchObject({
          constructor: BadRequestException,
          response: { code: 'INVALID_SWAP' },
        });
      }
      expect(svc.recordSwap).not.toHaveBeenCalled();
    });
  });

  describe('POST/GET /cook-logs/:cookLogId/photo (D-31 F5)', () => {
    it('POST forwards the buffer and mimetype to the service (F5 attach)', async () => {
      const svc = mockCook();
      const controller = new CookLogController(svc as any);
      const buf = Buffer.from('fake-image');
      const out = await controller.attachPhoto({ actor: userActor } as any, LOG_ID, {
        buffer: buf,
        mimetype: 'image/jpeg',
      } as any);
      expect(svc.attachPlatePhoto).toHaveBeenCalledWith(userActor, LOG_ID, buf, 'image/jpeg');
      expect(out).toEqual({ cook_log_id: LOG_ID, photo_uri: 's3://recipe-assets/cook/2222.jpg' });
    });

    it('POST refuses a non-JPEG/PNG mimetype (400 INVALID_IMAGE)', async () => {
      const svc = mockCook();
      const controller = new CookLogController(svc as any);
      await expect(
        controller.attachPhoto({ actor: userActor } as any, LOG_ID, {
          buffer: Buffer.from('x'),
          mimetype: 'image/gif',
        } as any),
      ).rejects.toMatchObject({ response: { code: 'INVALID_IMAGE' } });
      expect(svc.attachPlatePhoto).not.toHaveBeenCalled();
    });

    it('POST refuses an oversized file (400 IMAGE_TOO_LARGE)', async () => {
      const svc = mockCook();
      const controller = new CookLogController(svc as any);
      await expect(
        controller.attachPhoto({ actor: userActor } as any, LOG_ID, {
          buffer: Buffer.alloc(11 * 1024 * 1024),
          mimetype: 'image/png',
        } as any),
      ).rejects.toMatchObject({ response: { code: 'IMAGE_TOO_LARGE' } });
      expect(svc.attachPlatePhoto).not.toHaveBeenCalled();
    });

    it('POST refuses a missing/empty file (400 INVALID_IMAGE)', async () => {
      const svc = mockCook();
      const controller = new CookLogController(svc as any);
      await expect(
        controller.attachPhoto({ actor: userActor } as any, LOG_ID, undefined),
      ).rejects.toMatchObject({ response: { code: 'INVALID_IMAGE' } });
      expect(svc.attachPlatePhoto).not.toHaveBeenCalled();
    });

    it('GET forwards to the service and returns the photo wire (F5 read)', async () => {
      const svc = mockCook();
      const controller = new CookLogController(svc as any);
      const out = await controller.platePhoto({ actor: userActor } as any, LOG_ID);
      expect(svc.platePhoto).toHaveBeenCalledWith(userActor, LOG_ID);
      expect(out).toEqual({ cook_log_id: LOG_ID, photo_uri: 's3://recipe-assets/cook/2222.jpg' });
    });
  });
});
