// CsrfGuard — double-submit token for the cookie-session architecture
// (Tech Stack §15). Apply to every state-changing route (POST/PATCH/DELETE).

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { CSRF_COOKIE, CSRF_HEADER, csrfMatches } from '../../modules/auth/session';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return true;
    const cookies = (req.cookies as Record<string, string>) ?? {};
    const header = req.headers[CSRF_HEADER];
    const headerValue = Array.isArray(header) ? header[0] : header;
    if (!csrfMatches(cookies[CSRF_COOKIE], headerValue)) {
      throw new ForbiddenException({
        code: 'CSRF_MISMATCH',
        message: 'CSRF token missing or mismatched',
      });
    }
    return true;
  }
}
