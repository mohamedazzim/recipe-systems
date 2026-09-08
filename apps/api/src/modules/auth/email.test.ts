// Email validation matrix — the application-boundary rule (identity email claims).
import {
  EMAIL_MAX_LENGTH,
  EmailValidationError,
  normalizeEmail,
  validateAndNormalizeEmail,
  validateEmail,
} from './email';

describe('normalizeEmail', () => {
  it.each([
    ['User@Example.com', 'user@example.com'],
    ['  User@Example.com  ', 'user@example.com'],
    ['user@example.com', 'user@example.com'],
    ['UPPER.CASE@DOMAIN.COM', 'upper.case@domain.com'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});

describe('validateEmail', () => {
  it.each([
    'user@example.com',
    'User@Example.com',
    'first.last+tag@sub.example.co.uk',
    'x@test.dev',
    'a@b.co',
  ])('accepts %j', (input) => {
    const result = validateEmail(input);
    expect(result.ok).toBe(true);
    expect(result.email).toBe(normalizeEmail(input));
  });

  it.each([
    ['demo@gmail.c', 'MALFORMED'], // single-letter TLD — the live DB evidence case
    ['not-an-email', 'MALFORMED'],
    ['@example.com', 'MALFORMED'],
    ['user@', 'MALFORMED'],
    ['user@localhost', 'MALFORMED'], // no dotted domain
    ['user@example', 'MALFORMED'], // no TLD
    ['user name@example.com', 'MALFORMED'], // internal space
    ['user@@example.com', 'MALFORMED'],
  ])('rejects %j (%s)', (input, code) => {
    expect(validateEmail(input)).toEqual({ ok: false, error: code });
  });

  it('rejects empty and whitespace-only input', () => {
    expect(validateEmail('')).toEqual({ ok: false, error: 'EMPTY' });
    expect(validateEmail('   ')).toEqual({ ok: false, error: 'EMPTY' });
    expect(validateEmail('\t\n ')).toEqual({ ok: false, error: 'EMPTY' });
  });

  it('rejects over-length emails (schema column is VARCHAR(320))', () => {
    const local = 'a'.repeat(100);
    const domain = 'b'.repeat(220);
    const over = `${local}@${domain}.com`; // 325 chars
    expect(over.length).toBeGreaterThan(EMAIL_MAX_LENGTH);
    expect(validateEmail(over)).toEqual({ ok: false, error: 'TOO_LONG' });
    // near the limit but valid shape (labels ≤ 63): 50+1+60+1+60+1+60+4 = 237 chars
    const atLimit = `${'a'.repeat(50)}@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.com`;
    expect(atLimit.length).toBeLessThanOrEqual(EMAIL_MAX_LENGTH);
    expect(validateEmail(atLimit).ok).toBe(true);
  });
});

describe('validateAndNormalizeEmail', () => {
  it('returns the normalized form for valid input', () => {
    expect(validateAndNormalizeEmail(' User@Example.COM ')).toBe('user@example.com');
  });

  it.each([
    ['demo@gmail.c', 'MALFORMED'],
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
  ])('throws EmailValidationError for %j (%s)', (input, code) => {
    expect(() => validateAndNormalizeEmail(input)).toThrow(EmailValidationError);
    try {
      validateAndNormalizeEmail(input);
    } catch (err) {
      expect((err as EmailValidationError).code).toBe(code);
    }
  });
});
