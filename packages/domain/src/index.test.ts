import { DOMAIN_CONTRACTS_FROZEN_AT } from './index';

describe('domain package bootstrap', () => {
  it('marks the contract freeze point for D-05 (no contracts invented before P0-5)', () => {
    expect(DOMAIN_CONTRACTS_FROZEN_AT).toMatch(/P0-5/);
  });
});
