// Provider-neutral identity seam (BUILD_PLAN §5; DISPATCH D-06).
//
// The BFF consumes OIDC/OAuth2 claims through this interface and NEVER calls
// Keycloak-specific APIs outside the provider implementation. Swapping the
// identity provider is a configuration change, not a code change (D-06 done
// criterion: "the adapter seam is demonstrable").
//
// Keycloak is the sole active identity provider (Q8 RESOLVED 2026-09-07;
// SCAFFOLD §3). Do not introduce a second provider (A-06 BLOCKER).

export interface VerifiedClaims {
  /** OIDC `sub` — provider-side subject identifier. */
  sub: string;
  /** Verified email claim (the canonical account identity link, ERD §5 `account.email` UNIQUE). */
  email: string;
  /** Verified email_verified claim, when present. */
  emailVerified?: boolean;
  /** display name, when the provider supplies it. */
  name?: string;
}

export interface AuthorizationRequest {
  /** Opaque state value the BFF generated; the provider must round-trip it. */
  state: string;
  /** OIDC nonce bound to the ID token. */
  nonce: string;
}

export interface IdentityProvider {
  /** URL the browser must be redirected to for interactive login (authorization-code flow). */
  buildAuthorizationUrl(req: AuthorizationRequest): string;
  /**
   * URL for IdP-hosted account registration (Keycloak owns credential lifecycle — SCAFFOLD §3).
   * Carries state/nonce so the auto-login after registration returns a verifiable callback.
   */
  buildRegistrationUrl(req: AuthorizationRequest): string;
  /** URL for the IdP's password-reset flow. */
  buildPasswordResetUrl(): string;
  /**
   * RP-initiated logout URL — ends the IdP SSO session so the next sign-in
   * prompts for credentials (OIDC `post_logout_redirect_uri`). The verified
   * ID token is passed as `id_token_hint` so the IdP skips its logout
   * confirmation screen (OIDC RP-Initiated Logout §4).
   */
  buildLogoutUrl(postLogoutRedirectUri: string, idTokenHint?: string): string;
  /**
   * Exchange an authorization code for tokens, then verify the ID token:
   * signature (JWKS), issuer, audience, and nonce. Returns verified claims
   * plus the raw ID token (logout id_token_hint).
   */
  handleCallback(
    code: string,
    expectedState: string,
    expectedNonce: string,
  ): Promise<VerifiedClaims & { idTokenHint: string }>;
  /** Validate an already-issued ID token (used by tests/ops; sessions are BFF-issued). */
  verifyIdToken(idToken: string, expectedNonce?: string): Promise<VerifiedClaims>;
}
