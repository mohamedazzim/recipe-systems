// GuestOrJwtGuard — resolves the request actor: a verified account session OR a
// valid guest_session row (SCAFFOLD §3: unguessable UUID, expiry, scoped to one
// guest session). The guest-session table is the D-08 spine; intake endpoints
// (D-10+) consume this guard.
//
// D-09 (ownership enforcement) builds on this actor resolution; this guard only
// RESOLVES identity — it does not authorize writes.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import { Inject } from '@nestjs/common';
import { Request } from 'express';
import {
  CSRF_COOKIE,
  GUEST_COOKIE,
  SESSION_COOKIE,
  SessionPayload,
  slideSessionCookies,
  verifySession,
} from '../../modules/auth/session';

export interface GuestActor {
  kind: 'guest';
  guestSessionId: string;
  expiresAt: Date;
}

export type Actor = { kind: 'user'; user: SessionPayload } | GuestActor;

export interface ActorRequest extends Request {
  user?: SessionPayload;
  guest?: GuestActor;
  actor?: Actor;
}

@Injectable()
export class GuestOrJwtGuard implements CanActivate {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<ActorRequest>();
    const cookies = (req.cookies as Record<string, string>) ?? {};

    const sessionToken = cookies[SESSION_COOKIE];
    if (sessionToken) {
      const user = await verifySession(sessionToken);
      req.user = user;
      req.actor = { kind: 'user', user };
      // Sliding idle renewal: the SSE status poll runs through this guard for
      // the whole analysis — without sliding here the session cookie would age
      // out mid-analysis even while the page is actively polling.
      slideSessionCookies(http.getResponse(), sessionToken, cookies[CSRF_COOKIE]);
      return true;
    }

    const guestToken = cookies[GUEST_COOKIE];
    if (guestToken) {
      const session = await this.prisma.guestSession.findUnique({
        where: { id: guestToken },
      });
      if (!session) return false;
      if (session.expiresAt.getTime() <= Date.now()) return false;
      if (session.claimedAt) return false; // claimed sessions are audit-only
      req.guest = {
        kind: 'guest',
        guestSessionId: session.id,
        expiresAt: session.expiresAt,
      };
      req.actor = req.guest;
      return true;
    }

    return false; // no identity — route returns 401/403 as appropriate
  }
}
