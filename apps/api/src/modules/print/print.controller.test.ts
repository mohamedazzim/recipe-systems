// D-23 — PrintController boundary tests: pdf/html content types, filename
// disposition, delegation. Guards/ownership covered by the shared guard and
// PrintService suites.

import { ActorRequest } from '../../common/guards/guest-or-jwt.guard';
import { PrintController } from './print.controller';
import { PrintService } from './print.service';

function controller() {
  const print = {
    shoppingListPrint: jest.fn(async (_a: unknown, _id: string, format: string) =>
      format === 'html'
        ? { pdf: null, html: '<html>list</html>', filename: 'shopping-list-r1.pdf' }
        : { pdf: Buffer.from('%PDF-1.4 fake'), html: '<html>list</html>', filename: 'shopping-list-r1.pdf' },
    ),
    stationCardPrint: jest.fn(async (_a: unknown, _id: string, format: string) =>
      format === 'html'
        ? { pdf: null, html: '<html>card</html>', filename: 'station-card-r1.pdf' }
        : { pdf: Buffer.from('%PDF-1.4 fake'), html: '<html>card</html>', filename: 'station-card-r1.pdf' },
    ),
    onePagerPrint: jest.fn(async (_a: unknown, _id: string, format: string) =>
      format === 'html'
        ? { pdf: null, html: '<html>one-pager</html>', filename: 'one-pager-r1.pdf' }
        : { pdf: Buffer.from('%PDF-1.4 fake'), html: '<html>one-pager</html>', filename: 'one-pager-r1.pdf' },
    ),
  } as unknown as PrintService;
  return { c: new PrintController(print), print };
}

const REQ = { actor: { kind: 'user', user: { accountId: 'a', email: 'e@e.e' } } } as unknown as ActorRequest;

function resMock() {
  const headers: Record<string, string> = {};
  return {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    send: jest.fn(),
    headers,
  };
}

describe('PrintController (D-23)', () => {
  it('shopping list defaults to application/pdf with the canonical filename', async () => {
    const { c, print } = controller();
    const res = resMock();
    await c.shoppingList(REQ, 'r1', undefined, res as never);
    expect(print.shoppingListPrint).toHaveBeenCalledWith(REQ.actor, 'r1', 'pdf');
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toContain('shopping-list-r1.pdf');
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it('shopping list ?format=html serves the SAME template as text/html (SCAFFOLD §4)', async () => {
    const { c, print } = controller();
    const res = resMock();
    await c.shoppingList(REQ, 'r1', 'html', res as never);
    expect(print.shoppingListPrint).toHaveBeenCalledWith(REQ.actor, 'r1', 'html');
    expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith('<html>list</html>');
  });

  it('station card serves pdf and html formats', async () => {
    const { c, print } = controller();
    const res = resMock();
    await c.stationCard(REQ, 'r1', undefined, res as never);
    expect(print.stationCardPrint).toHaveBeenCalledWith(REQ.actor, 'r1', 'pdf');
    expect(res.headers['Content-Type']).toBe('application/pdf');

    const res2 = resMock();
    await c.stationCard(REQ, 'r1', 'html', res2 as never);
    expect(res2.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res2.send).toHaveBeenCalledWith('<html>card</html>');
  });

  it('one-pager serves pdf and html formats (E6/I5 D-31)', async () => {
    const { c, print } = controller();
    const res = resMock();
    await c.onePager(REQ, 'r1', undefined, res as never);
    expect(print.onePagerPrint).toHaveBeenCalledWith(REQ.actor, 'r1', 'pdf');
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toContain('one-pager-r1.pdf');

    const res2 = resMock();
    await c.onePager(REQ, 'r1', 'html', res2 as never);
    expect(res2.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(res2.send).toHaveBeenCalledWith('<html>one-pager</html>');
  });
});
