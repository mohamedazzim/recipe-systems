import { NINE_VIEW_SCHEMAS_FROZEN_AT, SCHEMA_VERSION, VIEW_SCHEMAS } from './index';

describe('schemas package freeze record', () => {
  it('marks the D-05 freeze point and a concrete version', () => {
    expect(NINE_VIEW_SCHEMAS_FROZEN_AT).toMatch(/P0-5/);
    expect(SCHEMA_VERSION).toBe('1.0.0');
  });

  it('exposes exactly the nine canonical view schemas under view_1..view_9', () => {
    expect(Object.keys(VIEW_SCHEMAS)).toEqual([
      'view_1', 'view_2', 'view_3', 'view_4', 'view_5', 'view_6', 'view_7', 'view_8', 'view_9',
    ]);
  });
});
