'use client';

// D-10A (B5) — structured form intake. Enter ingredients as name + amount
// (free-text amount, so every B5 AC-2 unit is accepted: tsp, tbsp, g, kg, nos,
// to taste, as required, lemon size, half shell). Posts to POST /recipes/form,
// which produces the SAME corrected object as paste/photo — the returned lines
// feed the existing review/analysis flow unchanged.

import { forwardRef, useImperativeHandle, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { previewOf, recordSessionRecipe } from '@/lib/flow';
import type { ParseTextResponse, WireLine } from '@/lib/types';

export interface FormIntakeProps {
  signedIn: boolean;
  accountId: string | null;
  onParsed: (recipeId: string, lines: WireLine[]) => void;
  /** Report the form's in-flight state to the shared Add-a-recipe footer. */
  onBusyChange?: (busy: boolean) => void;
}

/** Imperative handle so the shared Add-a-recipe footer can drive the form. */
export interface FormIntakeHandle {
  submit: () => void;
  hasAnyName: () => boolean;
}

interface FormRow {
  key: string;
  name: string;
  amount: string;
}

let rowSeq = 0;
const nextKey = (): string => `form-row-${++rowSeq}`;

export const FormIntake = forwardRef<FormIntakeHandle, FormIntakeProps>(
  function FormIntake({ signedIn, accountId, onParsed, onBusyChange }, ref) {
  const [rows, setRows] = useState<FormRow[]>([{ key: nextKey(), name: '', amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setRow = (key: string, patch: Partial<FormRow>): void =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = (): void => setRows((rs) => [...rs, { key: nextKey(), name: '', amount: '' }]);
  const removeRow = (key: string): void =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  const submit = async (): Promise<void> => {
    const ingredients = rows
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        display_name: r.name.trim(),
        amount: r.amount.trim() === '' ? null : r.amount.trim(),
      }));
    if (ingredients.length === 0) return;
    setSubmitting(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const result = await api<ParseTextResponse>('/recipes/form', {
        method: 'POST',
        body: JSON.stringify({ ingredients }),
      });
      recordSessionRecipe(
        result.recipe_id,
        previewOf(
          ingredients
            .map((i) => `${i.display_name}${i.amount ? ` — ${i.amount}` : ''}`)
            .join('\n'),
        ),
        signedIn && accountId ? { kind: 'user', accountId } : { kind: 'guest' },
        result.recipe.lines,
      );
      onParsed(result.recipe_id, result.recipe.lines);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'The server could not be reached. Check your connection and try again.',
      );
      setSubmitting(false);
      onBusyChange?.(false);
    }
  };

  const hasAnyName = rows.some((r) => r.name.trim().length > 0);

  useImperativeHandle(
    ref,
    () => ({
      submit: () => void submit(),
      hasAnyName: () => hasAnyName,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, submit],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label="Structured form intake"
    >
      <ul className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-44 flex-1">
              <Field
                htmlFor={`form-name-${row.key}`}
                label={index === 0 ? 'Ingredient' : `Ingredient ${index + 1}`}
              >
                <Input
                  id={`form-name-${row.key}`}
                  value={row.name}
                  onChange={(e) => setRow(row.key, { name: e.target.value })}
                  placeholder="e.g. Fish"
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="min-w-40 flex-1">
              <Field
                htmlFor={`form-amount-${row.key}`}
                label={index === 0 ? 'Amount' : `Amount ${index + 1}`}
                hint="Free text — 500g, 2 tsp, to taste, half shell…"
              >
                <Input
                  id={`form-amount-${row.key}`}
                  value={row.amount}
                  onChange={(e) => setRow(row.key, { amount: e.target.value })}
                  placeholder="e.g. 500g"
                  autoComplete="off"
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => removeRow(row.key)}
              disabled={rows.length === 1}
              aria-label={`Remove row ${index + 1}`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          Add ingredient
        </Button>
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error" title="Could not add the recipe">
            {error}
          </Alert>
        </div>
      )}
    </form>
  );
});
