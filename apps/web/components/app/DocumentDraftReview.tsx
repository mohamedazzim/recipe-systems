'use client';

// Phase 4 draft review — the editable, authoritative review surface for one
// document's extracted drafts. The model extraction (`payload`) is immutable
// source evidence; the user's edits are the authoritative draft state, saved to
// `user_payload` and confirmed into a real recipe through the existing path.

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Plus, Trash, Warning } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Heading, Text } from '@/components/ui/Typography';
import { api, ApiError } from '@/lib/api';
import type {
  ConfirmDraftResponse,
  DocumentDraft,
  DraftEdit,
  DraftIngredient,
  DraftMethodStep,
  DraftProvenance,
  RecipeDraft,
} from '@/lib/types';

export interface DocumentDraftReviewProps {
  ingestionId: string;
  originalFilename: string;
  onBack: () => void;
  /** Phase 4: navigate to the normal Recipe Workspace after confirmation. */
  onConfirmed: (recipeId: string, title: string | null) => void;
}

function ReviewBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-caption font-semibold text-gold">
      <Warning size={12} aria-hidden="true" weight="bold" />
      Needs review
    </span>
  );
}

function provenanceLabel(p: DraftProvenance): string {
  switch (p) {
    case 'user_corrected':
      return 'Corrected';
    case 'user_added':
      return 'Added';
    case 'source':
      return 'From source';
  }
}

/** The model extraction mapped into the editable draft shape (provenance = source). */
function fromPayload(payload: RecipeDraft): DraftEdit {
  return {
    title: payload.title,
    title_needs_review: payload.title_needs_review,
    ingredients: payload.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      preparation: i.preparation,
      provenance: 'source',
      source: i.source,
      needs_review: i.needs_review,
    })),
    method_steps: payload.method_steps.map((s) => ({
      text: s.text,
      provenance: 'source',
      source: s.source,
      needs_review: s.needs_review,
    })),
  };
}

const EMPTY_INGREDIENT = (): DraftIngredient => ({
  name: '',
  quantity: null,
  unit: null,
  preparation: null,
  provenance: 'user_added',
  source: null,
  needs_review: false,
});

const EMPTY_STEP = (): DraftMethodStep => ({
  text: '',
  provenance: 'user_added',
  source: null,
  needs_review: false,
});

interface EditableDraftCardProps {
  ingestionId: string;
  draft: DocumentDraft;
  onConfirmed: (recipeId: string, title: string | null) => void;
}

function EditableDraftCard({ ingestionId, draft, onConfirmed }: EditableDraftCardProps) {
  const [edit, setEdit] = useState<DraftEdit>(() => draft.user_payload ?? fromPayload(draft.payload));
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftPath = `/recipes/import/documents/${ingestionId}/drafts/${draft.draft_id}`;

  const unresolved =
    edit.title_needs_review ||
    edit.ingredients.some((i) => i.needs_review) ||
    edit.method_steps.some((s) => s.needs_review);

  // Editing a source-faithful row marks it user-corrected and resolves its flag.
  const markEdited = (provenance: DraftProvenance): DraftProvenance =>
    provenance === 'user_added' ? 'user_added' : 'user_corrected';

  const setTitle = (title: string) =>
    setEdit((e) => ({ ...e, title: title || null, title_needs_review: false }));
  const updateIngredient = (index: number, patch: Partial<DraftIngredient>) =>
    setEdit((e) => ({
      ...e,
      ingredients: e.ingredients.map((ing, i) =>
        i === index
          ? { ...ing, ...patch, provenance: markEdited(ing.provenance), needs_review: false }
          : ing,
      ),
    }));
  const deleteIngredient = (index: number) =>
    setEdit((e) => ({ ...e, ingredients: e.ingredients.filter((_, i) => i !== index) }));
  const addIngredient = () =>
    setEdit((e) => ({ ...e, ingredients: [...e.ingredients, EMPTY_INGREDIENT()] }));
  const updateStep = (index: number, patch: Partial<DraftMethodStep>) =>
    setEdit((e) => ({
      ...e,
      method_steps: e.method_steps.map((s, i) =>
        i === index
          ? { ...s, ...patch, provenance: markEdited(s.provenance), needs_review: false }
          : s,
      ),
    }));
  const deleteStep = (index: number) =>
    setEdit((e) => ({ ...e, method_steps: e.method_steps.filter((_, i) => i !== index) }));
  const addStep = () => setEdit((e) => ({ ...e, method_steps: [...e.method_steps, EMPTY_STEP()] }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const wire = await api<DocumentDraft>(draftPath, {
        method: 'PATCH',
        body: JSON.stringify(edit),
      });
      if (wire.user_payload) setEdit(wire.user_payload);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the draft.');
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    setCreating(true);
    setError(null);
    try {
      // Always persist the current edits first — the user's final draft is authoritative.
      await api<DocumentDraft>(draftPath, { method: 'PATCH', body: JSON.stringify(edit) });
      const res = await api<ConfirmDraftResponse>(`${draftPath}/confirm`, { method: 'POST' });
      onConfirmed(res.recipe_id, edit.title);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the recipe.');
      setCreating(false);
    }
  };

  // A confirmed draft is read-only: show the created-recipe state.
  if (draft.status === 'confirmed' && draft.recipe_id) {
    return (
      <section className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-h3 text-ink">{edit.title ?? 'Untitled recipe'}</h2>
            <p className="mt-0.5 text-caption text-positive">Recipe created from this draft.</p>
          </div>
          <Button onClick={() => onConfirmed(draft.recipe_id!, edit.title)}>
            Open recipe <Check size={14} aria-hidden="true" weight="bold" />
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="font-display text-h3 text-ink">{edit.title ?? 'Untitled recipe'}</h2>
        <ReviewBadge active={unresolved} />
      </div>

      <div className="space-y-6 px-5 py-4">
        <Field htmlFor={`${draft.draft_id}-title`} label="Recipe title">
          <Input
            id={`${draft.draft_id}-title`}
            value={edit.title ?? ''}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled recipe"
          />
          {draft.title === null && edit.title === null && (
            <p className="text-caption text-faint">No title was present in the source.</p>
          )}
        </Field>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-small font-semibold uppercase tracking-wide text-muted">Ingredients</h3>
            <Button size="sm" variant="outline" onClick={addIngredient}>
              <Plus size={14} aria-hidden="true" /> Add ingredient
            </Button>
          </div>
          {edit.ingredients.length === 0 ? (
            <p className="mt-2 text-caption text-faint">No ingredients — add one above.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {edit.ingredients.map((ing, i) => (
                <li key={i} className="rounded-md border border-border bg-canvas px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-caption font-semibold ${ing.provenance === 'source' ? 'text-muted' : 'text-accent-strong'}`}
                    >
                      {provenanceLabel(ing.provenance)}
                    </span>
                    <div className="flex items-center gap-2">
                      <ReviewBadge active={ing.needs_review} />
                      <button
                        type="button"
                        onClick={() => deleteIngredient(i)}
                        aria-label={`Delete ingredient ${ing.name || i + 1}`}
                        className="inline-flex items-center rounded-sm text-faint hover:text-negative focus-visible:outline-2 focus-visible:outline-gold"
                      >
                        <Trash size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <Input
                      aria-label={`Ingredient name ${i + 1}`}
                      value={ing.name}
                      onChange={(e) => updateIngredient(i, { name: e.target.value })}
                      placeholder="Ingredient"
                    />
                    <Input
                      aria-label={`Ingredient quantity ${i + 1}`}
                      value={ing.quantity ?? ''}
                      onChange={(e) => updateIngredient(i, { quantity: e.target.value || null })}
                      placeholder="Quantity"
                    />
                    <Input
                      aria-label={`Ingredient unit ${i + 1}`}
                      value={ing.unit ?? ''}
                      onChange={(e) => updateIngredient(i, { unit: e.target.value || null })}
                      placeholder="Unit"
                    />
                    <Input
                      aria-label={`Ingredient preparation ${i + 1}`}
                      value={ing.preparation ?? ''}
                      onChange={(e) => updateIngredient(i, { preparation: e.target.value || null })}
                      placeholder="Preparation"
                    />
                  </div>
                  {ing.source && (
                    <span className="mt-1 block text-caption text-faint">Source: “{ing.source}”</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-small font-semibold uppercase tracking-wide text-muted">Method</h3>
            <Button size="sm" variant="outline" onClick={addStep}>
              <Plus size={14} aria-hidden="true" /> Add step
            </Button>
          </div>
          {edit.method_steps.length === 0 ? (
            <p className="mt-2 text-caption text-faint">No method steps — add one above.</p>
          ) : (
            <ol className="mt-2 list-inside list-decimal space-y-2">
              {edit.method_steps.map((step, i) => (
                <li key={i} className="rounded-md border border-border bg-canvas px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-caption font-semibold ${step.provenance === 'source' ? 'text-muted' : 'text-accent-strong'}`}
                    >
                      {provenanceLabel(step.provenance)}
                    </span>
                    <div className="flex items-center gap-2">
                      <ReviewBadge active={step.needs_review} />
                      <button
                        type="button"
                        onClick={() => deleteStep(i)}
                        aria-label={`Delete method step ${i + 1}`}
                        className="inline-flex items-center rounded-sm text-faint hover:text-negative focus-visible:outline-2 focus-visible:outline-gold"
                      >
                        <Trash size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <Textarea
                    aria-label={`Method step ${i + 1}`}
                    value={step.text}
                    onChange={(e) => updateStep(i, { text: e.target.value })}
                    rows={2}
                    autoGrow
                    className="mt-1.5"
                  />
                  {step.source && (
                    <span className="mt-1 block text-caption text-faint">Source: “{step.source}”</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {error && (
          <Alert tone="error" title="Something went wrong">
            {error}
          </Alert>
        )}
        {saved && !error && (
          <Alert tone="success" title="Saved">
            Your edits are saved. Reload the page any time — they persist.
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button size="lg" onClick={() => void save()} disabled={saving || creating}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => void confirm()}
            disabled={saving || creating || unresolved}
            title={unresolved ? 'Resolve the “Needs review” items before creating the recipe' : undefined}
          >
            {creating ? 'Creating recipe…' : 'Create recipe'}
          </Button>
          {unresolved && (
            <span className="text-small text-muted" role="note">
              Resolve the flagged items to enable Create recipe.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export function DocumentDraftReview({
  ingestionId,
  originalFilename,
  onBack,
  onConfirmed,
}: DocumentDraftReviewProps) {
  const [drafts, setDrafts] = useState<DocumentDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ drafts: DocumentDraft[] }>(`/recipes/import/documents/${ingestionId}/drafts`)
      .then((result) => {
        if (!cancelled) setDrafts(result.drafts);
      })
      .catch((err) => {
        if (!cancelled) {
          setDrafts([]);
          setError(err instanceof ApiError ? err.message : 'Could not load the draft.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ingestionId]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to upload
      </button>

      <Heading level={1} className="mt-5">
        Recipe draft
      </Heading>
      <Text className="mt-1 text-muted">
        Review and correct the draft extracted from{' '}
        <span className="font-semibold text-ink">{originalFilename}</span>. Your edits are the
        authoritative recipe — the source evidence is preserved for every extracted line.
      </Text>

      <div className="mt-5 overflow-hidden rounded-[1.25rem] border border-border shadow-whisper">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/draft-banner.png"
          alt=""
          className="h-40 w-full object-cover object-center sm:h-48"
          loading="lazy"
        />
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error" title="Could not load the draft">{error}</Alert>
        </div>
      )}

      {drafts === null && !error && <Spinner label="Loading draft" />}

      {drafts !== null && drafts.length === 0 && !error && (
        <div className="mt-6">
          <Alert tone="info" title="No draft">No recipe draft was extracted from this document.</Alert>
        </div>
      )}

      {drafts !== null &&
        drafts.map((draft) => (
          <EditableDraftCard
            key={draft.draft_id}
            ingestionId={ingestionId}
            draft={draft}
            onConfirmed={onConfirmed}
          />
        ))}
    </div>
  );
}
