'use client';

// Method attach (D-13 surface, RS-US-09). Real modes only: paste (METHOD),
// inferred with a named source (INFERRED), or none. The consequence shown for
// "no method" is the canonical one: list-only, so Views 3 and 7 will be
// INCOMPLETE. Guests cannot attach a method (API §4: Bearer only).

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import type { MethodState } from '@/lib/types';

export interface MethodSectionProps {
  recipeId: string;
  signedIn: boolean;
  onChange?: (state: MethodState) => void;
}

type Mode = 'none' | 'paste' | 'inferred';

export function MethodSection({ recipeId, signedIn, onChange }: MethodSectionProps) {
  const [state, setState] = useState<MethodState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>('none');
  const [text, setText] = useState('');
  const [source, setSource] = useState('');

  useEffect(() => {
    if (signedIn) {
      void attach({ method: 'none', method_text: '', method_source: '' }, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, signedIn]);

  async function attach(body: { method: Mode; method_text: string; method_source: string }, silent = false): Promise<void> {
    if (!silent) setSaving(true);
    if (!silent) setError(null);
    try {
      const result = await api<MethodState>(`/recipes/${recipeId}/method`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setState(result);
      onChange?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the method.');
    } finally {
      if (!silent) setSaving(false);
    }
  }

  const submit = (): void => {
    if (mode === 'paste') {
      void attach({ method: 'paste', method_text: text, method_source: '' });
    } else if (mode === 'inferred') {
      void attach({ method: 'inferred', method_text: text, method_source: source });
    } else {
      void attach({ method: 'none', method_text: '', method_source: '' });
    }
  };

  return (
    <section aria-labelledby="method-heading" className="mt-12 border-t border-border pt-8">
      <h2 id="method-heading" className="font-display text-h2 text-ink">
        Method
      </h2>
      <p className="mt-1 text-small text-muted">
        How the dish is cooked. With no method, the analysis is list-only: Views 3 and 7 will be
        incomplete.
      </p>

      {state && (
        <p className="mt-4 text-small text-body" aria-live="polite">
          {state.method_tag === null && 'Method not provided.'}
          {state.method_tag === 'METHOD' && 'Method saved from your paste.'}
          {state.method_tag === 'INFERRED' &&
            `Inferred from: ${state.method_source ?? 'a named source'}.`}
        </p>
      )}

      {error && (
        <div className="mt-4">
          <Alert tone="error" title="Could not save the method">
            {error}
          </Alert>
        </div>
      )}

      {!signedIn ? (
        <p className="mt-4 text-small text-muted">
          Method attach needs an account. Sign in to continue this recipe.
        </p>
      ) : (
        <div className="mt-5 max-w-2xl">
          <fieldset>
            <legend className="sr-only">Method source</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Method source">
              {(
                [
                  ['paste', 'I will paste it'],
                  ['inferred', 'Accepted from a source'],
                  ['none', 'No method'],
                ] as Array<[Mode, string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-md border px-3 py-2 text-small font-semibold transition-colors ${
                    mode === value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-strong bg-surface text-body hover:bg-ink/5'
                  }`}
                >
                  <input
                    type="radio"
                    name="method-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {mode === 'paste' && (
            <Field htmlFor="method-text" label="Method text" className="mt-4">
              <Textarea
                id="method-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="Boil tamarind water; temper; add fish; simmer."
              />
            </Field>
          )}

          {mode === 'inferred' && (
            <div className="mt-4 grid gap-3">
              <Field htmlFor="method-text" label="Method text">
                <Textarea
                  id="method-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  placeholder="The method as recorded on the card."
                />
              </Field>
              <Field htmlFor="method-source" label="Named source" hint="Where this method was inferred from.">
                <Input
                  id="method-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="CDK 1669 / Mrs. Anitha"
                />
              </Field>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              onClick={submit}
              disabled={saving || (mode === 'paste' && text.trim().length === 0) || (mode === 'inferred' && (text.trim().length === 0 || source.trim().length === 0))}
            >
              {saving ? 'Saving...' : 'Save method'}
            </Button>
            {saving && <Spinner size="sm" label="Saving method" />}
          </div>
        </div>
      )}
    </section>
  );
}
