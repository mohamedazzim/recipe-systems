// BFF session mechanics (SCAFFOLD §3; Tech Stack §14/§15).
//
// Session: HS256 JWT issued by the BFF after a verified OIDC login, carried in an
// httpOnly cookie. The app never forwards IdP tokens to the browser — the browser
// holds only the BFF session (the ROPC-era Keycloak access tokens are gone).
//
// CSRF (Tech Stack §15): double-submit token. On session/guest creation the BFF
// sets a non-httpOnly `recipe_csrf` cookie; state-changing routes require the
// `X-CSRF-Token` header to match it (constant-time compare).

import { randomBytes, timingSafeEqual } from 'crypto';
import * as jose from 'jose';

export const SESSION_COOKIE = 'recipe_session';
export const GUEST_COOKIE = 'recipe_guest_session';
export const CSRF_COOKIE = 'recipe_csrf';
export const OAUTH_STATE_COOKIE = 'recipe_oauth_state';
export const CSRF_HEADER = 'x-csrf-token';

export interface SessionPayload {
  /** account.id — the canonical account row this session represents. */
  accountId: string;
  /** Verified email at sign-in time (identity link, ERD §5). */
  email: string;
  /** OIDC subject, kept for audit/debug in HANDOFF evidence only. */
  sub: string;
  /** Raw verified ID token, kept for RP-initiated logout (id_token_hint). */
  idTokenHint?: string;
}

export interface OAuthStatePayload {
  state: string;
  nonce: string;
  redirectTo: string;
}

export function defaultSessionTtl(): number {
  return Number(process.env.SESSION_TTL_SECONDS ?? 900);
}

/**
 * Absolute ceiling for a signed-in BFF session (the JWT `exp`). The browser cookie
 * slides on authenticated activity (see JwtAuthGuard), so an actively-used session
 * never dies mid-analysis — but even with constant activity it cannot outlive this
 * ceiling. Idle timeout remains `SESSION_TTL_SECONDS`.
 */
export function defaultSessionAbsoluteTtl(): number {
  return Number(process.env.SESSION_ABSOLUTE_TTL_SECONDS ?? 28800);
}

export function defaultGuestTtl(): number {
  // Q11 (guest TTL) is OPEN — labeled pilot default, HANDOFF-documented (D-08).
  return Number(process.env.GUEST_TTL_SECONDS ?? 86400);
}

export function sessionCookieSecure(): boolean {
  // Browsers treat http://localhost as a secure context; production must stay `true`.
  return process.env.SESSION_SECURE !== 'false';
}

export async function signSession(
  payload: SessionPayload,
  ttlSeconds: number = defaultSessionTtl(),
): Promise<string> {
  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(sessionSecret());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jose.jwtVerify(token, sessionSecret(), {
    algorithms: ['HS256'],
  });
  if (typeof payload.accountId !== 'string' || typeof payload.email !== 'string') {
    throw new Error('malformed session payload');
  }
  return {
    accountId: payload.accountId,
    email: payload.email,
    sub: typeof payload.sub === 'string' ? payload.sub : '',
  };
}

/**
 * Decode a session JWT WITHOUT verification — used only to recover the logout
 * id_token_hint when the session is already expired. The hint is re-validated
 * by the IdP; it is never trusted by the BFF.
 */
export function decodeSession(token: string): { idTokenHint?: string } {
  const payload = jose.decodeJwt(token);
  return { idTokenHint: typeof payload.idTokenHint === 'string' ? payload.idTokenHint : undefined };
}

export async function signOAuthState(payload: OAuthStatePayload): Promise<string> {
  return new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('300s')
    .sign(sessionSecret());
}

export async function verifyOAuthState(token: string): Promise<OAuthStatePayload> {
  const { payload } = await jose.jwtVerify(token, sessionSecret(), {
    algorithms: ['HS256'],
  });
  if (typeof payload.state !== 'string' || typeof payload.nonce !== 'string') {
    throw new Error('malformed oauth state');
  }
  return {
    state: payload.state,
    nonce: payload.nonce,
    redirectTo: typeof payload.redirectTo === 'string' ? payload.redirectTo : '/',
  };
}

export function newCsrfToken(): string {
  return randomBytes(24).toString('base64url');
}

export function csrfMatches(
  cookieValue: string | undefined,
  headerValue: string | undefined,
): boolean {
  if (!cookieValue || !headerValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(headerValue);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionCookieOptions(maxAgeSeconds: number): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: 'lax',
    path: '/',
    // Express res.cookie maxAge is in MILLISECONDS — convert from seconds here.
    maxAge: maxAgeSeconds * 1000,
  };
}

function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Dev fallback only; production MUST inject SESSION_SECRET (Tech Stack §16).
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET is required in production');
    }
    return new TextEncoder().encode('dev-session-secret-change-me');
  }
  return new TextEncoder().encode(secret);
}
