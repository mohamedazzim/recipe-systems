// AuthController — /api/v1/auth/* (SCAFFOLD §3 mechanics).
//
// Interactive OIDC: GET /auth/login redirects the browser to Keycloak; the
// authorization-code callback lands at GET /auth/callback. No ROPC, no admin-REST,
// no app-side password handling (Keycloak owns credential lifecycle).
//
// State-changing routes carry JwtAuthGuard + CsrfGuard (Tech Stack §14/§15).

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { JwtAuthGuard, AuthedRequest } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { EmailValidationError } from './email';
import {
  CSRF_COOKIE,
  GUEST_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
} from './session';

const preferencesSchema = z.object({
  preferred_mode: z.enum(['home', 'chef']).optional(),
  label_pack: z.enum(['US', 'EU']).nullable().optional(),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Browser app origin for post-auth redirects (configurable, never from user input). */
  private webOrigin(): string {
    return process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  }

  /** Start interactive login — redirects to the IdP authorization endpoint. */
  @Get('login')
  async login(@Query('redirect_to') redirectTo: string | undefined, @Res() res: Response) {
    const target = typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : '/';
    const { authorizationUrl, stateCookie } = await this.auth.beginLogin(target);
    res.cookie(OAUTH_STATE_COOKIE, stateCookie, {
      httpOnly: true,
      secure: this.auth.cookieOptions(300).secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 300 * 1000, // Express maxAge is milliseconds
    });
    return res.redirect(302, authorizationUrl);
  }

  /** Authorization-code callback — verify, upsert account, issue session. */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const stateCookie = (req.cookies as Record<string, string>)?.[OAUTH_STATE_COOKIE];
    if (!code || !state) {
      // Malformed/direct hit — never a raw JSON error page.
      return res.redirect(
        302,
        `${this.webOrigin()}/?auth_error=${encodeURIComponent('Login link was invalid or expired.')}`,
      );
    }
    if (!stateCookie) {
      // Back/refresh re-visit of an already-completed callback: the session is
      // already established, so land on the app home instead of a raw JSON error.
      return res.redirect(302, `${this.webOrigin()}/`);
    }
    try {
      const result = await this.auth.completeLogin(code, state, stateCookie);
      res.cookie(SESSION_COOKIE, result.session, this.auth.cookieOptions(this.auth.sessionTtlSeconds()));
      res.cookie(CSRF_COOKIE, result.csrf, {
        httpOnly: false,
        secure: this.auth.cookieOptions(300).secure,
        sameSite: 'lax',
        path: '/',
        maxAge: this.auth.sessionTtlSeconds() * 1000, // Express maxAge is milliseconds
      });
      res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
      // QA-B2 fix (A2 AC-2): claim the pending guest session on ANY successful
      // sign-in/sign-up — the recipes move onto the account inside one transaction.
      // Best-effort and non-fatal: an expired/foreign/absent guest cookie must never
      // break the login itself.
      const guestToken = (req.cookies as Record<string, string>)?.[GUEST_COOKIE];
      let claimed = false;
      if (guestToken) {
        try {
          await this.auth.claimGuestSession(result.accountId, guestToken);
          claimed = true;
        } catch {
          // no guest session, expired, or claimed elsewhere — nothing to move
        }
        res.clearCookie(GUEST_COOKIE, { path: '/' });
      }
      const target = result.redirectTo.startsWith('/') ? result.redirectTo : '/';
      // The web re-tags its local session records when this marker is present
      // (claimed guest recipes must move to "This session", never "Other sessions").
      const claimedTarget = claimed
        ? `${target}${target.includes('?') ? '&' : '?'}claimed=1`
        : target;
      return res.redirect(302, `${this.webOrigin()}${claimedTarget}`);
    } catch (err) {
      // Failed logins (invalid credentials, expired code, IdP errors) must land on a
      // user-facing state in the app — never a raw JSON error page.
      res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
      const message =
        err instanceof EmailValidationError
          ? 'The identity provider returned an invalid email address for this account.'
          : err instanceof Error
            ? err.message
            : 'Login failed';
      return res.redirect(302, `${this.webOrigin()}/?auth_error=${encodeURIComponent(message)}`);
    }
  }

  /** Sign-up — IdP registration with state/nonce; auto-login lands on /auth/callback. */
  @Get('signup')
  async signup(@Res() res: Response) {
    const { registrationUrl, stateCookie } = await this.auth.beginSignup('/');
    res.cookie(OAUTH_STATE_COOKIE, stateCookie, {
      httpOnly: true,
      secure: this.auth.cookieOptions(300).secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 300 * 1000, // Express maxAge is milliseconds
    });
    return res.redirect(302, registrationUrl);
  }

  /** Forgot password — redirects to the IdP reset flow. */
  @Get('password/forgot')
  forgotPassword(@Res() res: Response) {
    return res.redirect(302, this.auth.getPasswordResetUrl());
  }

  @Post('logout')
  @UseGuards(CsrfGuard)
  logout(@Req() req: Request, @Res() res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    // RP-initiated logout: the browser must also end the Keycloak SSO session,
    // otherwise the next "Sign in" silently re-authenticates (no login prompt).
    // The id_token_hint (if any) lets Keycloak skip its logout-confirmation screen.
    // Guests have no IdP session — no redirect, just clear the app cookies.
    const hint = this.auth.readLogoutHint((req.cookies as Record<string, string>)?.[SESSION_COOKIE]);
    return res.status(200).json({
      ok: true,
      ...(hint ? { redirect_to: this.auth.getLogoutRedirectUrl(this.webOrigin(), hint) } : {}),
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user!.accountId);
  }

  @Patch('me/preferences')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async preferences(@Req() req: AuthedRequest, @Body() body: unknown) {
    const parsed = preferencesSchema.parse(body);
    return this.auth.updatePreferences(req.user!.accountId, {
      preferredMode: parsed.preferred_mode,
      labelPack: parsed.label_pack,
    });
  }

  /** A2: create or REUSE a guest session (unguessable UUID, TTL — SCAFFOLD §3; D-08).
   *  QA-B1 fix: an existing valid cookie keeps its session — repeated dashboard
   *  entries must not orphan the guest's recipes behind a fresh row. */
  @Post('guest/session')
  async guestSession(@Req() req: Request, @Res() res: Response) {
    const existing = (req.cookies as Record<string, string>)?.[GUEST_COOKIE] ?? null;
    const { guestSessionId, csrf } = await this.auth.createGuestSession(existing);
    res.cookie(GUEST_COOKIE, guestSessionId, {
      httpOnly: true,
      secure: this.auth.cookieOptions(0).secure,
      sameSite: 'lax',
      path: '/',
    });
    res.cookie(CSRF_COOKIE, csrf, {
      httpOnly: false,
      secure: this.auth.cookieOptions(0).secure,
      sameSite: 'lax',
      path: '/',
    });
    return res.status(200).json({ ok: true, guest_session_id: guestSessionId });
  }

  /** A2: claim the current guest session onto the signed-in account. */
  @Post('guest/claim')
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async claimGuest(@Req() req: AuthedRequest) {
    const cookies = (req.cookies as Record<string, string>) ?? {};
    const guestToken = cookies[GUEST_COOKIE];
    if (!guestToken) {
      throw new BadRequestException({
        code: 'NO_GUEST_SESSION',
        message: 'No guest session cookie present',
      });
    }
    try {
      const result = await this.auth.claimGuestSession(req.user!.accountId, guestToken);
      return { ok: true, claimed: result.claimed };
    } catch (err) {
      throw new BadRequestException({
        code: 'CLAIM_FAILED',
        message: err instanceof Error ? err.message : 'Claim failed',
      });
    }
  }
}
