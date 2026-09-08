// AuthService — OIDC login/session orchestration and the A2 guest-session spine.
//
// Flows implemented here (D-06/D-07/D-08):
//  - login: build the IdP authorization URL with a signed state+nonce cookie
//  - callback: exchange code → verify ID token (signature/issuer/audience/nonce) →
//              upsert `account` → issue the BFF session cookie
//  - signup / password reset: redirects to the IdP (Keycloak owns credential lifecycle)
//  - guest: create a guest_session row + cookie; claim it on sign-in (idempotent,
//           XOR-respecting recipe move, guest row preserved as audit)

import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@recipe-systems/database';
import { AccountService, toAccountRow } from '../account/account.service';
import { IDENTITY_PROVIDER } from './identity/identity.module';
import { IdentityProvider } from './identity/identity-provider.interface';
import {
  defaultGuestTtl,
  defaultSessionTtl,
  GUEST_COOKIE,
  newCsrfToken,
  signOAuthState,
  signSession,
  verifyOAuthState,
  decodeSession,
  sessionCookieOptions,
} from './session';

@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly accounts: AccountService,
  ) {}

  async beginLogin(redirectTo: string): Promise<{
    authorizationUrl: string;
    stateCookie: string;
  }> {
    const state = randomBytes(16).toString('hex');
    const nonce = randomBytes(16).toString('hex');
    const stateCookie = await signOAuthState({ state, nonce, redirectTo });
    const authorizationUrl = this.identity.buildAuthorizationUrl({ state, nonce });
    return { authorizationUrl, stateCookie };
  }

  /** Signup: same state/nonce cookie as login — Keycloak auto-logs in after registration and
   *  the callback treats it exactly like a login. */
  async beginSignup(redirectTo: string): Promise<{
    registrationUrl: string;
    stateCookie: string;
  }> {
    const state = randomBytes(16).toString('hex');
    const nonce = randomBytes(16).toString('hex');
    const stateCookie = await signOAuthState({ state, nonce, redirectTo });
    const registrationUrl = this.identity.buildRegistrationUrl({ state, nonce });
    return { registrationUrl, stateCookie };
  }

  async completeLogin(code: string, state: string, stateCookie: string): Promise<{
    session: string;
    csrf: string;
    redirectTo: string;
    email: string;
  }> {
    const oauthState = await verifyOAuthState(stateCookie);
    if (oauthState.state !== state) {
      throw new Error('oauth state mismatch');
    }
    const claims = await this.identity.handleCallback(code, state, oauthState.nonce);
    const account = await this.accounts.upsertForSignIn({ email: claims.email });
    const session = await signSession({
      accountId: account.id,
      email: account.email,
      sub: claims.sub,
      // Retained for RP-initiated logout: lets Keycloak skip the logout
      // confirmation screen (OIDC id_token_hint). Re-validated by the IdP.
      idTokenHint: claims.idTokenHint,
    });
    return {
      session,
      csrf: newCsrfToken(),
      redirectTo: oauthState.redirectTo,
      email: account.email,
    };
  }

  /** A2 claim spine (D-08): idempotent; guest row preserved as audit; XOR holds. */
  async claimGuestSession(
    accountId: string,
    guestSessionId: string,
  ): Promise<{ claimed: 'new' | 'already' }> {
    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.guestSession.findUnique({ where: { id: guestSessionId } });
      if (!guest) throw new Error('guest session not found');
      if (guest.expiresAt.getTime() <= Date.now()) throw new Error('guest session expired');
      if (guest.claimedAt) {
        if (guest.claimedByAccountId === accountId) return { claimed: 'already' as const };
        throw new Error('guest session already claimed by another account');
      }
      // XOR-respecting move: guest-owned recipes become account-owned.
      await tx.recipe.updateMany({
        where: { guestSessionId },
        data: { accountId, guestSessionId: null },
      });
      await tx.guestSession.update({
        where: { id: guestSessionId },
        data: { claimedAt: new Date(), claimedByAccountId: accountId },
      });
      return { claimed: 'new' as const };
    });
  }

  async createGuestSession(): Promise<{ guestSessionId: string; csrf: string }> {
    const guest = await this.prisma.guestSession.create({
      data: {
        expiresAt: new Date(Date.now() + defaultGuestTtl() * 1000),
      },
    });
    return { guestSessionId: guest.id, csrf: newCsrfToken() };
  }

  getRegistrationUrl(): string {
    throw new Error('registration now requires a state/nonce — use beginSignup()');
  }

  getPasswordResetUrl(): string {
    return this.identity.buildPasswordResetUrl();
  }

  /** RP-initiated logout URL — kills the IdP SSO session so sign-in prompts again. */
  getLogoutRedirectUrl(webOrigin: string, idTokenHint?: string): string {
    return this.identity.buildLogoutUrl(webOrigin, idTokenHint);
  }

  /**
   * Recover the logout id_token_hint from an (possibly expired) BFF session
   * token. The hint is opaque to us — the IdP re-validates it.
   */
  readLogoutHint(sessionToken: string | undefined): string | undefined {
    if (!sessionToken) return undefined;
    try {
      return decodeSession(sessionToken).idTokenHint;
    } catch {
      return undefined;
    }
  }

  async me(accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new Error('account not found');
    return toAccountRow(account);
  }

  updatePreferences(accountId: string, prefs: { preferredMode?: string; labelPack?: string | null }) {
    return this.accounts.updatePreferences(accountId, prefs);
  }

  sessionTtlSeconds(): number {
    return defaultSessionTtl();
  }

  cookieOptions(maxAgeSeconds: number) {
    return sessionCookieOptions(maxAgeSeconds);
  }

  guestCookieName(): string {
    return GUEST_COOKIE;
  }
}
