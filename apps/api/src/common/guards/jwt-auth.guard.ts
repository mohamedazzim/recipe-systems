// JwtAuthGuard — verifies the BFF-issued session cookie (never a Keycloak JWT).
// Attaches the verified session to req.user. Missing/invalid session → 401.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  SESSION_COOKIE,
  SessionPayload,
  verifySession,
} from '../../modules/auth/session';

export interface AuthedRequest extends Request {
  user?: SessionPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
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
    return true;
  }
}
