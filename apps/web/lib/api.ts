// Web API helper — BFF base URL + cookie-credentialed fetch + CSRF header.
// The CSRF double-submit token rides the `recipe_csrf` cookie (non-httpOnly, set by the BFF).

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Session expiry is GLOBAL state, not a per-view error: a 401 on any authed call
 *  means the BFF session is gone. The shell registers ONE handler so the user gets
 *  a single re-sign-in prompt, instead of each component surfacing a raw
 *  "Sign in required" and leaving its buttons silently dead. */
const AUTH_ERROR_CODES = ['UNAUTHENTICATED', 'SESSION_EXPIRED', 'UNAUTHORIZED'];

let sessionExpiredHandler: (() => void) | null = null;

/** Register the shell's re-sign-in handler (null clears it). */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

function notifyIfSessionExpired(status: number, code: string): void {
  if (status === 401 || AUTH_ERROR_CODES.includes(code)) sessionExpiredHandler?.();
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const method = (init.method ?? 'GET').toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const csrf = readCookie('recipe_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
  // 204 No Content (the canonical DELETE contract, API doc §3) has no body:
  // parsing it as JSON throws and turns a successful call into an error.
  if (res.status === 204) {
    return undefined as T;
  }
  if (!res.ok) {
    let code = 'HTTP_ERROR';
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      // non-JSON error body — keep defaults
    }
    notifyIfSessionExpired(res.status, code);
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

/** Photo upload + OCR transcription ceiling. DeepSeek/Gemini vision OCR is slow
 *  (reasoning models); 2.5 min leaves headroom without letting a hung request
 *  wedge the UI. */
export const UPLOAD_TIMEOUT_MS = 150_000;

/** D-11 (B2): multipart upload helper. FormData needs no Content-Type (the
 *  browser sets the boundary); CSRF + cookie credentials ride exactly like `api`.
 *  A generous abort window (OCR transcription on the deployed server can be slow)
 *  guarantees the UI never wedges on "Working…" — a timeout surfaces as a
 *  recoverable error with a Retry, never an infinite spinner. */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  timeoutMs = UPLOAD_TIMEOUT_MS,
): Promise<T> {
  const headers: Record<string, string> = {};
  const csrf = readCookie('recipe_csrf');
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: form,
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new ApiError(
        0,
        'UPLOAD_TIMEOUT',
        'The upload timed out — the card may still be processing. Retry in a moment.',
      );
    }
    throw err;
  }
  clearTimeout(timer);
  if (!res.ok) {
    let code = 'HTTP_ERROR';
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      // non-JSON error body — keep defaults
    }
    notifyIfSessionExpired(res.status, code);
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}
