'use client';

// Ingredient review (D-12 surface): the structured lines, inline-editable,
// with the real backend actions (edit, add, delete, split, merge, sense
// confirm, exclude-as-header). The original submission stays preserved in
// `recipe_input` — this view only touches the draft lines.

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  PencilSimple,
  Plus,
  Scissors,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import type { WireLine } from '@/lib/types';

export interface IngredientReviewProps {
  recipeId: string;
  signedIn: boolean;
  /** The user-facing recipe label (session preview). */
  title: string;
  /** Lines already returned by POST /recipes/parse-text (the guest-capable
   *  path). Guests render these read-only and NEVER fetch GET /lines, which
   *  is Bearer-only (API doc §3). Signed-in users fetch fresh lines but
   *  render these immediately as a first paint. */
  initialLines?: WireLine[] | null;
  /** Lift the authoritative lines upward (name resolution for the views). */
  onLinesLoaded?: (lines: WireLine[]) => void;
  /** Fires after a USER mutation (edit/delete/add/split/merge/header) — the
   *  workspace uses it to mark a completed analysis stale. Never fires on
   *  load/hydration. */
  onChanged?: () => void;
}

interface EditorState {
  display_name: string;
  amount: string;
  unit: string;
  category: string;
  include_on_list: boolean;
  sense_confirmed: boolean;
}

function emptyEditor(line: WireLine): EditorState {
  return {
    display_name: line.display_name,
    amount: line.amount ?? '',
    unit: line.unit ?? '',
    category: line.category ?? '',
    include_on_list: line.include_on_list,
    sense_confirmed: line.confirmed_sense !== null,
  };
}

function uniqueLines(lines: WireLine[]): WireLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (seen.has(line.id)) return false;
    seen.add(line.id);
    return true;
  });
}

export function IngredientReview({ recipeId, signedIn, title, initialLines = null, onLinesLoaded, onChanged }: IngredientReviewProps) {
  const [lines, setLines] = useState<WireLine[] | null>(
    initialLines ? uniqueLines(initialLines) : initialLines,
  );
  const [error, setError] = useState<string | null>(null);
  /** RECIPE_NOT_FOUND for a signed-in actor means a cross-session recipe
   *  (INV-17: foreign recipes 404). Distinct copy, never a raw error. */
  const [foreignRecipe, setForeignRecipe] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [splitPoint, setSplitPoint] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setForeignRecipe(false);
    try {
      const result = await api<{ items: WireLine[] }>(`/recipes/${recipeId}/lines`);
      const nextLines = uniqueLines(result.items);
      setLines(nextLines);
      // D-1: header lines are lifted out — the views/readiness read ingredients only.
      onLinesLoaded?.(nextLines.filter((l) => !l.is_header));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RECIPE_NOT_FOUND') {
        setForeignRecipe(true);
        setError(null);
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load the ingredient lines. Refresh the page to retry.',
      );
    }
  }, [recipeId, onLinesLoaded]);

  useEffect(() => {
    setEditingId(null);
    setSplittingId(null);
    if (!signedIn) {
      // Guests: read-only, render the parse-text lines, never fetch Bearer-only
      // routes (API §3). No spinner, no dead request.
      const nextLines = uniqueLines(initialLines ?? []);
      setLines(nextLines);
      // D-1: header lines are lifted out — the views/readiness read ingredients only.
      onLinesLoaded?.(nextLines.filter((l) => !l.is_header));
      setError(null);
      return;
    }
    if (initialLines === null) {
      setLines(null);
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, signedIn]);

  const beginEdit = (line: WireLine): void => {
    setEditingId(line.id);
    setEditor(emptyEditor(line));
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditor(null);
  };

  const saveEdit = async (line: WireLine): Promise<void> => {
    if (!editor) return;
    setSaving(true);
    setNotice(null);
    try {
      const body: Record<string, unknown> = {
        display_name: editor.display_name,
        amount: editor.amount.trim() === '' ? null : editor.amount,
        unit: editor.unit.trim() === '' ? null : editor.unit,
        category: editor.category.trim() === '' ? null : editor.category,
        include_on_list: editor.include_on_list,
        confirmed_sense: editor.sense_confirmed ? editor.display_name : null,
        expected_updated_at: line.updated_at,
      };
      await api(`/recipes/${recipeId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      cancelEdit();
      await refresh();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_EDIT') {
        cancelEdit();
        await refresh();
        setError('This line changed elsewhere. The list has been reloaded; try your edit again.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not save the line.');
      }
    } finally {
      setSaving(false);
    }
  };

  const clearReview = async (line: WireLine): Promise<void> => {
    setSaving(true);
    setNotice(null);
    try {
      await api(`/recipes/${recipeId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ needs_review: false, expected_updated_at: line.updated_at }),
      });
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not clear the review flag.');
    } finally {
      setSaving(false);
    }
  };

  /** D-25 B6: accept the resolved canonical for an ambiguous line. Records the
   *  canonical in confirmed_sense and NEVER rewrites display_name — the original
   *  captured text stays preserved. */
  const confirmSense = async (line: WireLine, canonical: string): Promise<void> => {
    setSaving(true);
    setNotice(null);
    try {
      await api(`/recipes/${recipeId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ confirmed_sense: canonical, expected_updated_at: line.updated_at }),
      });
      await refresh();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_EDIT') {
        await refresh();
        setError('This line changed elsewhere. The list has been reloaded.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not confirm the ingredient.');
      }
    } finally {
      setSaving(false);
    }
  };

  const removeLine = async (line: WireLine): Promise<void> => {
    setSaving(true);
    setNotice(null);
    try {
      // Canonical DELETE contract (API doc §3): 204 No Content, NO body — the
      // backend soft-deletes the row by id with no stale-edit token involved.
      await api(`/recipes/${recipeId}/lines/${line.id}`, {
        method: 'DELETE',
      });
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the line.');
    } finally {
      setSaving(false);
    }
  };

  /** D-1 (B3/D-12): mark a line as a header (excluded from ingredients) or
   *  restore it. Reuses the existing PATCH is_header path. */
  const toggleHeader = async (line: WireLine): Promise<void> => {
    setSaving(true);
    setNotice(null);
    try {
      await api(`/recipes/${recipeId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_header: !line.is_header, expected_updated_at: line.updated_at }),
      });
      await refresh();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_EDIT') {
        await refresh();
        setError('This line changed elsewhere. The list has been reloaded.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not update the line.');
      }
    } finally {
      setSaving(false);
    }
  };

  const mergeWithNext = async (line: WireLine): Promise<void> => {
    setSaving(true);
    setNotice(null);
    try {
      await api(`/recipes/${recipeId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ merge_with_next: true, expected_updated_at: line.updated_at }),
      });
      await refresh();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_EDIT') {
        await refresh();
        setError('This line changed elsewhere. The list has been reloaded.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not merge the lines.');
      }
    } finally {
      setSaving(false);
    }
  };

  const split = async (line: WireLine): Promise<void> => {
    const point = Number(splitPoint);
    if (!Number.isInteger(point) || point < 1) {
      setError('The split point must be a character position of at least 1.');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await api(`/recipes/${recipeId}/lines/${line.id}/split`, {
        method: 'POST',
        body: JSON.stringify({
          split_point: point,
          expected_updated_at: line.updated_at,
        }),
      });
      setSplittingId(null);
      setSplitPoint('');
      await refresh();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_EDIT') {
        setSplittingId(null);
        await refresh();
        setError('This line changed elsewhere. The list has been reloaded.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not split the line.');
      }
    } finally {
      setSaving(false);
    }
  };

  const addLine = async (): Promise<void> => {
    setSaving(true);
    setNotice(null);
    try {
      await api(`/recipes/${recipeId}/lines`, {
        method: 'POST',
        body: JSON.stringify({ display_name: 'New ingredient', include_on_list: true }),
      });
      await refresh();
      onChanged?.();
      const added = (await api<{ items: WireLine[] }>(`/recipes/${recipeId}/lines`)).items;
      const last = added[added.length - 1];
      if (last && lines) {
        beginEdit(last);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add a line.');
    } finally {
      setSaving(false);
    }
  };

  if (foreignRecipe) {
    return (
      <section aria-labelledby="ingredients-heading">
        <h2 id="ingredients-heading" className="font-display text-h2 text-ink">
          Review your ingredients
        </h2>
        <div className="mt-4">
          <Alert tone="info" title="This recipe belongs to a different session">
            Recipes can only be opened by the identity that created them. This one was
            {signedIn ? 'created in a guest session' : 'created under an account'}. Sign in
            with that identity to open it, or create a new recipe here.
          </Alert>
        </div>
      </section>
    );
  }

  if (lines === null) {
    if (error !== null) {
      // The fetch failed: never spin forever on an error.
      return (
        <section aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading" className="font-display text-h2 text-ink">
            Review your ingredients
          </h2>
          <div className="mt-4">
            <Alert tone="error" title="Could not load the ingredient lines">
              {error}
            </Alert>
          </div>
          <div className="mt-4">
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        </section>
      );
    }
    return (
      <div className="flex items-center gap-3 py-10 text-small text-muted">
        <Spinner size="sm" label="Loading ingredients" />
        Loading ingredients...
      </div>
    );
  }

  const ingredientLines = lines.filter((l) => !l.is_header);
  const headerLines = lines.filter((l) => l.is_header);

  return (
    <section aria-labelledby="ingredients-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="ingredients-heading" className="font-display text-h2 text-ink">
            Review your ingredients
          </h2>
          <p className="mt-1 text-small text-muted">
            Check the extracted lines before analysis. Your original paste stays preserved
            exactly as entered.
          </p>
        </div>
        {signedIn && (
          <Button size="sm" variant="outline" onClick={() => void addLine()} disabled={saving}>
            <Plus size={14} aria-hidden="true" weight="bold" />
            Add line
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error" title="Something needs attention">
            {error}
          </Alert>
        </div>
      )}
      {notice && (
        <div className="mt-4">
          <Alert tone="info">{notice}</Alert>
        </div>
      )}

      <ul className="mt-5 divide-y divide-border rounded-lg border border-border bg-surface">
        {ingredientLines.map((line) => {
          const isEditing = editingId === line.id;
          const isSplitting = splittingId === line.id;
          return (
            <li key={line.id} className="px-4 py-3 sm:px-5">
              {isEditing && editor ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEdit(line);
                  }}
                  aria-label={`Edit line ${line.display_name}`}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field htmlFor={`name-${line.id}`} label="Display name" className="sm:col-span-2">
                      <Input
                        id={`name-${line.id}`}
                        value={editor.display_name}
                        onChange={(e) => setEditor({ ...editor, display_name: e.target.value })}
                        required
                      />
                    </Field>
                    <Field htmlFor={`amount-${line.id}`} label="Amount">
                      <Input
                        id={`amount-${line.id}`}
                        value={editor.amount}
                        onChange={(e) => setEditor({ ...editor, amount: e.target.value })}
                      />
                    </Field>
                    <Field htmlFor={`unit-${line.id}`} label="Unit">
                      <Input
                        id={`unit-${line.id}`}
                        value={editor.unit}
                        onChange={(e) => setEditor({ ...editor, unit: e.target.value })}
                      />
                    </Field>
                    <Field htmlFor={`cat-${line.id}`} label="Category">
                      <Input
                        id={`cat-${line.id}`}
                        value={editor.category}
                        onChange={(e) => setEditor({ ...editor, category: e.target.value })}
                      />
                    </Field>
                    <fieldset className="flex flex-col gap-2 sm:col-span-2">
                      <legend className="sr-only">Line options</legend>
                      <label className="flex items-center gap-2 text-small text-body">
                        <input
                          type="checkbox"
                          checked={editor.include_on_list}
                          onChange={(e) =>
                            setEditor({ ...editor, include_on_list: e.target.checked })
                          }
                          className="h-4 w-4 accent-[rgb(var(--rs-accent))]"
                        />
                        Include on shopping list
                      </label>
                      <label className="flex items-center gap-2 text-small text-body">
                        <input
                          type="checkbox"
                          checked={editor.sense_confirmed}
                          onChange={(e) =>
                            setEditor({ ...editor, sense_confirmed: e.target.checked })
                          }
                          className="h-4 w-4 accent-[rgb(var(--rs-accent))]"
                        />
                        Sense confirmed
                      </label>
                    </fieldset>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={saving || editor.display_name.trim() === ''}>
                      {saving ? 'Saving...' : 'Save line'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  {/* TOP — ingredient name, then quantity + unit grouped. */}
                  <div className="min-w-0">
                    <p className="break-words font-semibold leading-snug text-ink">
                      {line.display_name}
                    </p>
                    <p className="mt-1 text-small tabular text-muted">
                      <span className="whitespace-nowrap">
                        {line.amount || 'No amount'}
                        {line.unit ? ` ${line.unit}` : ''}
                      </span>
                      {line.category && (
                        <span className="whitespace-nowrap"> · {line.category}</span>
                      )}
                      {!line.include_on_list && <span> · not on list</span>}
                    </p>
                  </div>

                  {/* METADATA — canonical mapping, provenance, confirmation. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {line.canonical_name && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-caption text-muted">
                        <Check size={12} aria-hidden="true" weight="bold" />
                        {line.canonical_name.replace(/_/g, ' ')}
                      </span>
                    )}
                    {line.source_tag && (
                      <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-caption text-faint">
                        from {line.source_tag.toLowerCase()}
                      </span>
                    )}
                    {line.confirmed_sense !== null && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-positive/40 bg-positive/10 px-2 py-0.5 text-caption font-semibold text-positive">
                        <Check size={12} aria-hidden="true" weight="bold" />
                        Sense confirmed
                      </span>
                    )}
                    {line.needs_review && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-gold/60 bg-gold/10 px-2 py-0.5 text-caption font-semibold text-[#8A6516] dark:text-gold">
                        <Warning size={12} aria-hidden="true" weight="bold" />
                        Review required
                      </span>
                    )}
                    {line.ocr_confidence != null && (
                      <span
                        className={
                          line.ocr_confidence < 0.9
                            ? 'inline-flex items-center gap-1 rounded-full border border-gold/60 bg-gold/10 px-2 py-0.5 text-caption font-semibold text-[#8A6516] dark:text-gold'
                            : 'inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-caption text-muted'
                        }
                      >
                        {line.ocr_confidence < 0.9 && (
                          <Warning size={12} aria-hidden="true" weight="bold" />
                        )}
                        {Math.round(line.ocr_confidence * 100)}% confident
                      </span>
                    )}
                  </div>

                  {line.requires_confirmation && line.confirmed_sense === null && line.canonical_name && (
                    <div className="rounded-md border border-gold/60 bg-gold/10 p-3">
                      <p className="text-small text-body">
                        We read{' '}
                        <span className="font-semibold text-ink">{line.display_name}</span> as{' '}
                        <span className="font-semibold text-ink">
                          {line.canonical_name.replace(/_/g, ' ')}
                        </span>
                        . Is that right?
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => void confirmSense(line, line.canonical_name!)}
                          disabled={saving}
                        >
                          <Check size={14} aria-hidden="true" weight="bold" />
                          Accept
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => beginEdit(line)} disabled={saving}>
                          Edit instead
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ACTIONS — full-width toolbar; wraps instead of clipping. */}
                  {signedIn && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                      <Button size="sm" variant="ghost" onClick={() => beginEdit(line)} disabled={saving} aria-label={`Edit ${line.display_name}`}>
                        <PencilSimple size={14} aria-hidden="true" weight="bold" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void toggleHeader(line)}
                        disabled={saving}
                        aria-label={`Mark ${line.display_name} as header`}
                      >
                        Header
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSplittingId(isSplitting ? null : line.id);
                          setSplitPoint('');
                        }}
                        disabled={saving}
                        aria-label={`Split ${line.display_name}`}
                      >
                        <Scissors size={14} aria-hidden="true" weight="bold" />
                        Split
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void mergeWithNext(line)} disabled={saving} aria-label={`Merge ${line.display_name} with the next line`}>
                        Merge with next
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void removeLine(line)} disabled={saving} aria-label={`Delete ${line.display_name}`}>
                        <Trash size={14} aria-hidden="true" weight="bold" />
                        Delete
                      </Button>
                      {line.needs_review && (
                        <Button size="sm" variant="outline" onClick={() => void clearReview(line)} disabled={saving}>
                          Clear review
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isSplitting && !isEditing && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void split(line);
                  }}
                  className="mt-3 flex flex-wrap items-end gap-2"
                  aria-label={`Split ${line.display_name}`}
                >
                  <Field htmlFor={`split-${line.id}`} label="Split after character">
                    <Input
                      id={`split-${line.id}`}
                      value={splitPoint}
                      onChange={(e) => setSplitPoint(e.target.value)}
                      inputMode="numeric"
                      placeholder={`1 to ${Math.max(1, line.display_name.length - 1)}`}
                      className="w-40"
                    />
                  </Field>
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? 'Splitting...' : 'Split line'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSplittingId(null)}>
                    Cancel
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {headerLines.length > 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4">
          <h3 className="text-small font-semibold text-muted">
            Header lines — excluded from ingredients, shopping and print
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {headerLines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-small text-faint">{line.display_name}</span>
                {signedIn && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void toggleHeader(line)}
                    disabled={saving}
                    aria-label={`Restore ${line.display_name} as ingredient`}
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ingredientLines.length === 0 && (
        <div className="mt-5 rounded-lg border border-border bg-surface px-5 py-8 text-center">
          {!signedIn && initialLines === null ? (
            <p className="text-small text-muted">
              The parsed lines for this recipe aren&apos;t available in this session. Sign in to
              review and edit them — the recipe is kept on your account.
            </p>
          ) : (
            <p className="text-small text-muted">No ingredient lines.</p>
          )}
          {signedIn && (
            <div className="mt-4">
              <Button size="sm" variant="outline" onClick={() => void addLine()}>
                <Plus size={14} aria-hidden="true" weight="bold" />
                Add line
              </Button>
            </div>
          )}
        </div>
      )}

      {!signedIn && (
        <p className="mt-4 text-small text-muted">
          You are viewing these lines as a guest. Sign in to edit, add, split, or merge lines,
          and to run the analysis.
        </p>
      )}

      <p className="mt-4 text-caption text-faint">
        {ingredientLines.length} ingredient{ingredientLines.length === 1 ? '' : 's'}
        {headerLines.length > 0
          ? ` · ${headerLines.length} header${headerLines.length === 1 ? '' : 's'}`
          : ''}{' '}
        · the original submission is preserved unchanged.
      </p>
    </section>
  );
}
