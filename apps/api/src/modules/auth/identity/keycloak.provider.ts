// Keycloak OIDC provider — the ONLY file in the repository that knows Keycloak endpoints.
// Everything outside this file consumes OIDC claims through the IdentityProvider seam.
//
// Flow (ADR §7 authorization-code; confidential BFF client):
//   1. /auth/login redirects to the authorization endpoint (scope openid email profile).
//   2. /auth/callback exchanges the code at the token endpoint (client_secret_post).
//   3. The ID token is verified: JWKS signature, issuer, audience (client id), nonce.
//   4. Verified claims (sub, email, ...) become the BFF session.

import { Inject, Injectable } from '@nestjs/common';
import * as jose from 'jose';
import {
  AuthorizationRequest,
  IdentityProvider,
  VerifiedClaims,
} from './identity-provider.interface';

export interface KeycloakConfig {
  baseUrl: string; // e.g. http://localhost:8081
  realm: string; // recipesystems (D-06)
  clientId: string; // recipe-systems-bff
  clientSecret: string;
  issuerUrl: string; // must equal the token's iss claim
  redirectUri: string; // BFF callback
}

@Injectable()
export class KeycloakProvider implements IdentityProvider {
  private readonly jwks: jose.JWTVerifyGetKey;
  private readonly jwksUrl: URL;
  private readonly issuer: string;

  constructor(@Inject('KEYCLOAK_CONFIG') private readonly config: KeycloakConfig) {
    this.issuer = config.issuerUrl.replace(/\/$/, '');
    this.jwksUrl = new URL(
      `${this.issuer}/protocol/openid-connect/certs`,
    );
    // Remote JWKS with issuer+audience bound at creation; caching is built into jose.
    this.jwks = jose.createRemoteJWKSet(this.jwksUrl);
  }

  private authEndpoint(): string {
    return `${this.config.baseUrl.replace(/\/$/, '')}/realms/${this.config.realm}/protocol/openid-connect/auth`;
  }

  private tokenEndpoint(): string {
    return `${this.config.baseUrl.replace(/\/$/, '')}/realms/${this.config.realm}/protocol/openid-connect/token`;
  }

  private accountRedirect(path: string): string {
    return `${this.config.baseUrl.replace(/\/$/, '')}/realms/${this.config.realm}/account/#/${path}`;
  }

  buildAuthorizationUrl(req: AuthorizationRequest): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'openid email profile',
      state: req.state,
      nonce: req.nonce,
    });
    return `${this.authEndpoint()}?${params.toString()}`;
  }

  buildRegistrationUrl(req: AuthorizationRequest): string {
    // OIDC registration endpoint — server-rendered form; Keycloak echoes `state` back in the
    // auto-login redirect after successful registration (NOT the account-console SPA, which is
    // for authenticated users).
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: 'openid email profile',
      state: req.state,
      nonce: req.nonce,
    });
    return `${this.config.baseUrl.replace(/\/$/, '')}/realms/${this.config.realm}/protocol/openid-connect/registrations?${params.toString()}`;
  }

  buildPasswordResetUrl(): string {
    return `${this.accountRedirect('password')}`;
  }

  buildLogoutUrl(postLogoutRedirectUri: string, idTokenHint?: string): string {
    // RP-initiated logout: Keycloak ends the SSO session and sends the browser
    // back to the app. With id_token_hint Keycloak skips its logout-confirmation
    // screen (OIDC RP-Initiated Logout §4); the BFF does not retain ID tokens
    // beyond the session lifetime — the hint lives in the BFF session JWT.
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      post_logout_redirect_uri: postLogoutRedirectUri,
    });
    if (idTokenHint) {
      params.set('id_token_hint', idTokenHint);
    }
    return `${this.config.baseUrl.replace(/\/$/, '')}/realms/${this.config.realm}/protocol/openid-connect/logout?${params.toString()}`;
  }

  async handleCallback(
    code: string,
    expectedState: string,
    expectedNonce: string,
  ): Promise<VerifiedClaims & { idTokenHint: string }> {
    const tokenRes = await fetch(this.tokenEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(`identity token exchange failed (${tokenRes.status})`);
    }
    const tokens = (await tokenRes.json()) as {
      id_token?: string;
      access_token?: string;
    };
    if (!tokens.id_token) {
      throw new Error('identity token exchange returned no id_token');
    }
    const claims = await this.verifyIdToken(tokens.id_token, expectedNonce);
    // State/nonce validation against the BFF's own cookie is AuthService's job (defense in depth).
    void expectedState;
    return { ...claims, idTokenHint: tokens.id_token };
  }

  async verifyIdToken(idToken: string, expectedNonce?: string): Promise<VerifiedClaims> {
    const { payload } = await jose.jwtVerify(idToken, this.jwks, {
      issuer: this.issuer,
      audience: this.config.clientId,
      algorithms: ['RS256'],
    });
    if (!payload.sub) {
      throw new Error('identity id_token missing sub claim');
    }
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!email) {
      throw new Error('identity id_token missing email claim');
    }
    if (expectedNonce !== undefined && payload.nonce !== expectedNonce) {
      throw new Error('identity id_token nonce mismatch');
    }
    return {
      sub: payload.sub,
      email,
      emailVerified: typeof payload.email_verified === 'boolean' ? payload.email_verified : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  }
}
