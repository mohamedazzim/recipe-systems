// Account service — the only writer of the `account` table (one-writer rule, ADR §2).
// Keycloak owns credentials (SCAFFOLD §3): this service never sees passwords;
// `password_hash` stays null under the sso provider.

import { Inject, Injectable } from '@nestjs/common';
import { Account, PrismaClient } from '@recipe-systems/database';
import { validateAndNormalizeEmail } from '../auth/email';

export interface AccountRow {
  id: string;
  email: string;
  /** API contract (docs/Recipe_Systems_API.md §2): snake_case on the wire. */
  preferred_mode: string;
  label_pack: string | null;
}

export function toAccountRow(account: Account): AccountRow {
  return {
    id: account.id,
    email: account.email,
    preferred_mode: account.preferredMode,
    label_pack: account.labelPack,
  };
}

@Injectable()
export class AccountService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<Account | null> {
    return this.prisma.account.findUnique({ where: { email } });
  }

  /**
   * D-07: account creation on first sign-in. Idempotent on the NORMALIZED email.
   * The verified claim is still user-controlled data: it is validated and normalized
   * here before any row is created (the application boundary — never persist raw claims).
   */
  async upsertForSignIn(claims: { email: string }): Promise<Account> {
    const email = validateAndNormalizeEmail(claims.email);
    return this.prisma.account.upsert({
      where: { email },
      update: { updatedAt: new Date() },
      create: {
        email,
        authProvider: 'sso', // Keycloak is the sole IdP; CHECK password/sso
        preferredMode: 'home',
      },
    });
  }

  async updatePreferences(
    accountId: string,
    prefs: { preferredMode?: string; labelPack?: string | null },
  ): Promise<AccountRow> {
    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        ...(prefs.preferredMode !== undefined
          ? { preferredMode: prefs.preferredMode }
          : {}),
        ...(prefs.labelPack !== undefined ? { labelPack: prefs.labelPack } : {}),
      },
    });
    return toAccountRow(updated);
  }

  async touchLogin(accountId: string): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { updatedAt: new Date() },
    });
  }
}
