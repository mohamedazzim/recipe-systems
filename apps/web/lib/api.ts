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
