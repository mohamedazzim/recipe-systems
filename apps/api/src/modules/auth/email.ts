// Email validation + normalization — the application-boundary rule for identity emails.
//
// Keycloak verifies email OWNERSHIP; the BFF enforces SHAPE before any account row
// exists. The verified email claim is still user-controlled data, and the account
// table must never receive raw claims (evidence: broken `demo@gmail.c` rows that
// entered the DB before validation existed).
//
// Canonical form: trim + lowercase — used for every lookup/upsert; `account.email`
// (UNIQUE, VARCHAR(320), ERD §5) is the identity correlation key. The Keycloak
// subject (`sub`) is intentionally NOT persisted — the ERD v13 `account` table has
// no sub column and defines email as the canonical identity link (D-07/H-07).

import { z } from 'zod';

export const EMAIL_MAX_LENGTH = 320; // matches account.email VARCHAR(320) (migration 002)

/**
 * Strict RFC-ish syntax. Domain requires at least one dot and a TLD of 2+ letters,
 * so single-label domains (e.g. `demo@gmail.c`) are rejected.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export type EmailErrorCode = 'EMPTY' | 'TOO_LONG' | 'MALFORMED';

/** Trim + lowercase. The ONLY normalized form the application may persist or look up. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

const emailSchema = z
  .string()
  .trim()
  .min(1, 'EMPTY')
  .max(EMAIL_MAX_LENGTH, 'TOO_LONG')
  .regex(EMAIL_RE, 'MALFORMED');

export interface EmailValidationResult {
  ok: boolean;
  /** Normalized email when ok. */
  email?: string;
  /** Field-level failure code when not ok. */
  error?: EmailErrorCode;
}

export function validateEmail(input: string): EmailValidationResult {
  const normalized = normalizeEmail(input);
  const parsed = emailSchema.safeParse(normalized);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: (issue?.message as EmailErrorCode) ?? 'MALFORMED' };
  }
  return { ok: true, email: parsed.data };
}

export class EmailValidationError extends Error {
  constructor(public readonly code: EmailErrorCode) {
    super(`identity email rejected: ${code}`);
    this.name = 'EmailValidationError';
  }
}

/**
 * Validate and return the normalized email, or throw EmailValidationError.
 * Single entry point used by the account writer and the auth callback.
 */
export function validateAndNormalizeEmail(input: string): string {
  const result = validateEmail(input);
  if (!result.ok || result.email === undefined) {
    throw new EmailValidationError(result.error ?? 'MALFORMED');
  }
  return result.email;
}
