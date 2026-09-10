// JwtAuthGuard — verifies the BFF-issued session cookie (never a Keycloak JWT).
// Attaches the verified session to req.user. Missing/invalid session → 401.
//
// Sliding renewal (regression fix, real-LLM latency): the session cookie carries a
// short idle window (SESSION_TTL_SECONDS) while the JWT itself lives for the absolute
// ceiling (SESSION_ABSOLUTE_TTL_SECONDS). Every authenticated request re-issues the
// cookie with a fresh maxAge, so an actively-used session survives analyses that take
// many minutes, and only genuine idle (or the absolute ceiling) ends it.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SessionPayload,
  defaultSessionTtl,
  sessionCookieOptions,
  verifySession,
} from '../../modules/auth/session';

export interface AuthedRequest extends Request {
  user?: SessionPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const res = http.getResponse<Response>();
    const cookies = (req.cookies as Record<string, string> | undefined) ?? {};
    const cookie = cookies[SESSION_COOKIE];
    if (!cookie) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Sign in required',
      });
    }
    try {
      req.user = await verifySession(cookie);
    } catch {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        message: 'Session expired',
      });
    }
    // Slide the idle window: same token value, fresh cookie maxAge.
    res.cookie(SESSION_COOKIE, cookie, sessionCookieOptions(defaultSessionTtl()));
    const csrf = cookies[CSRF_COOKIE];
    if (csrf) {
      res.cookie(CSRF_COOKIE, csrf, {
        httpOnly: false,
        secure: sessionCookieOptions(0).secure,
        sameSite: 'lax',
        path: '/',
        maxAge: defaultSessionTtl() * 1000, // Express maxAge is milliseconds
      });
    }
    return true;
  }
}
