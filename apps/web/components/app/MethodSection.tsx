'use client';

// Method attach (D-13 surface, RS-US-09). Real modes only: paste (METHOD),
// inferred with a named source (INFERRED), or none. The consequence shown for
// "no method" is the canonical one: list-only, so Views 3 and 7 will be
// INCOMPLETE. Guests cannot attach a method (API §4: Bearer only).
//
// State semantics (bug-fix 2026-09-10, decision trace in HANDOFF §5):
//   - Mount HYDRATES via the read-only GET /recipes/:id/method. A previous
//     build PATCHed method:none on mount and destroyed the saved method on
//     every reopen — mounts must never write.
//   - The status line distinguishes ready / saving / saved / failure; the
//     form never claims "saved" before backend confirmation, and editing the
//     form after a save returns it to the ready state.

import { useCallback, useEffect, useRef, useState } from 'react';
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

function persistedMode(state: MethodState | null): Mode {
  if (state?.method_tag === 'METHOD') return 'paste';
  if (state?.method_tag === 'INFERRED') return 'inferred';
  return 'none';
}

export function MethodSection({ recipeId, signedIn, onChange }: MethodSectionProps) {
  const [state, setState] = useState<MethodState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>('none');
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  // true while the form differs from the persisted state — a dirty form never
  // shows "saved".
  const [dirty, setDirty] = useState(false);
  // the last mode the USER saved successfully (null = never saved in this view)
  const [userSaved, setUserSaved] = useState<Mode | null>(null);
  // a save completed before the mount-hydration returned: the late (stale)
  // hydration result must not overwrite the fresher saved state.
  const savedRef = useRef(false);

  useEffect(() => {
    if (!signedIn) return;
    savedRef.current = false;
    setUserSaved(null);
    // Read-only hydration — mounts never write (method-survives-reload).
    api<MethodState>(`/recipes/${recipeId}/method`)
      .then((loaded) => {
        if (savedRef.current) return; // a user save already settled — keep it
        setState(loaded);
        setMode(persistedMode(loaded));
        setDirty(false);
        onChange?.(loaded);
      })
      .catch(() => {
        // Read failure: leave the form ready-to-save; explicit saves still work
        // and surface their own errors.
      });
  }, [recipeId, signedIn, onChange]);

  const attach = useCallback(
    async (body: { method: Mode; method_text: string; method_source: string }): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        const result = await api<MethodState>(`/recipes/${recipeId}/method`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        savedRef.current = true;
        setState(result);
        setDirty(false);
        setUserSaved(body.method);
        onChange?.(result);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not save the method.');
      } finally {
        setSaving(false);
      }
    },
    [recipeId, onChange],
  );

  const submit = (): void => {
    if (mode === 'paste') {
      void attach({ method: 'paste', method_text: text, method_source: '' });
    } else if (mode === 'inferred') {
      void attach({ method: 'inferred', method_text: text, method_source: source });
    } else {
      void attach({ method: 'none', method_text: '', method_source: '' });
    }
  };

  const selectMode = (value: Mode): void => {
    setMode(value);
    setError(null);
    setDirty(value !== persistedMode(state));
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
          {saving
            ? 'Saving method…'
            : error
              ? `Could not save method — ${error}.`
              : dirty || (state.method_tag === null && userSaved === null)
                ? 'Method ready to save.'
                : 'Method saved.'}
        </p>
      )}
      {state && !dirty && !saving && !error && (
        <p className="mt-1 text-small text-muted">
          {state.method_tag === 'METHOD' && 'Tag: METHOD — saved from your paste.'}
          {state.method_tag === 'INFERRED' &&
            `Tag: INFERRED — source: ${state.method_source ?? 'a named source'}.`}
          {state.method_tag === null &&
            (userSaved === 'none'
              ? 'Method cleared. List-only: Views 3 and 7 will be incomplete.'
              : 'List-only: Views 3 and 7 will be incomplete.')}
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
                    onChange={() => selectMode(value)}
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
                onChange={(e) => {
                  setText(e.target.value);
                  setDirty(true);
                  setError(null);
                }}
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
                  onChange={(e) => {
                    setText(e.target.value);
                    setDirty(true);
                    setError(null);
                  }}
                  rows={5}
                  placeholder="The method as recorded on the card."
                />
              </Field>
              <Field htmlFor="method-source" label="Named source" hint="Where this method was inferred from.">
                <Input
                  id="method-source"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setDirty(true);
                    setError(null);
                  }}
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
