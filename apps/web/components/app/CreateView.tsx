'use client';

// Create recipe: text/paste AND photo upload intake. The photo path posts the
// card image to POST /recipes/upload (Intake photo → OCR → draft); OCR runs
// behind the provider-neutral ocr-adapter (Q10 stays OPEN). The returned draft
// lines carry ocr_confidence + needs_review so the review surface can flag
// low-confidence lines before analysis.

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, Lightbulb, X } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Input';
import { Heading, Text } from '@/components/ui/Typography';
import { api, apiUpload, ApiError } from '@/lib/api';
import type { ParseTextResponse, UploadResponse, WireLine } from '@/lib/types';
import { previewOf, recordSessionRecipe } from '@/lib/flow';
import { FormIntake, FormIntakeHandle } from '@/components/app/FormIntake';

export interface CreateViewProps {
  signedIn: boolean;
  /** The current identity's accountId (null when guest). */
  accountId: string | null;
  onBack: () => void;
  onParsed: (recipeId: string, lines: WireLine[]) => void;
  /** D-11 (B2): navigate after a completed photo upload, with the OCR draft. */
  onUploaded: (recipeId: string, lines: WireLine[]) => void;
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function CreateView({ signedIn, accountId, onBack, onParsed, onUploaded }: CreateViewProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // D-10A (B5): text/paste vs structured form vs photo — paste stays the default.
  const [mode, setMode] = useState<'paste' | 'form' | 'photo'>('paste');

  // Photo upload state (D-11 B2).
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Shared-footer validation error + the form tab's imperative handle.
  const [footerError, setFooterError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const formRef = useRef<FormIntakeHandle>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const submit = async (): Promise<void> => {
    if (text.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api<ParseTextResponse>('/recipes/parse-text', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      recordSessionRecipe(result.recipe_id, previewOf(text),
        signedIn && accountId ? { kind: 'user', accountId } : { kind: 'guest' },
        result.recipe.lines);
      onParsed(result.recipe_id, result.recipe.lines);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('The server could not be reached. Check your connection and try again.');
      }
      setSubmitting(false);
    }
  };

  const handleFile = (selected: File | null): void => {
    if (!selected) return;
    setUploadError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(selected.type)) {
      setFile(null);
      setPreviewUrl(null);
      setUploadError('Only JPEG or PNG images are accepted.');
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setFile(null);
      setPreviewUrl(null);
      setUploadError('The image is larger than 10 MB.');
      return;
    }
    setFile(selected);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    handleFile(e.target.files?.[0] ?? null);
  };

  /** The single shared footer action — validates whichever tab is active. */
  const handleFooterSubmit = (): void => {
    setFooterError(null);
    if (mode === 'paste') {
      if (text.trim().length === 0) {
        setFooterError('Paste some recipe text first.');
        return;
      }
      void submit();
    } else if (mode === 'form') {
      if (!formRef.current || !formRef.current.hasAnyName()) {
        setFooterError('Add at least one ingredient.');
        return;
      }
      formRef.current.submit();
    } else {
      if (!file) {
        setFooterError('Choose a photo first.');
        return;
      }
      void upload();
    }
  };

  const upload = async (): Promise<void> => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await apiUpload<UploadResponse>('/recipes/upload', form);
      recordSessionRecipe(
        result.recipe_id,
        `Photo: ${file.name}`,
        signedIn && accountId ? { kind: 'user', accountId } : { kind: 'guest' },
        result.lines,
      );
      onUploaded(result.recipe_id, result.lines);
    } catch (err) {
      // The uploaded photo + input row stay durable on OCR failure (503/422) —
      // keep the selected file so Retry re-POSTs it. Map to a plain message.
      setUploadError(
        err instanceof ApiError
          ? err.message
          : 'The server could not be reached. Check your connection and try again.',
      );
      setUploading(false);
    }
  };

  return (
    <div className="max-w-none">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to home
      </button>

      <Heading level={1} className="mt-5">
        Add a recipe
      </Heading>
      <Text className="mt-2 max-w-prose text-muted">
        Paste the recipe text, fill in a structured form, or upload a photo of a card. The
        original stays preserved exactly as entered; the structured lines are extracted for
        review next.
      </Text>

      {error && (
        <div className="mt-6">
          <Alert tone="error" title="Could not add the recipe">
            {error}
          </Alert>
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div
          className="flex gap-6 overflow-x-auto border-b border-border px-5"
          role="tablist"
          aria-label="Input mode"
        >
          {(
            [
              ['paste', 'Paste text'],
              ['form', 'Structured form'],
              ['photo', 'Photo'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-1 py-3 text-small font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-gold ${
                mode === key ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {mode === 'paste' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              aria-label="Paste a recipe"
            >
              <Field
                htmlFor="recipe-text"
                label="Recipe text"
                hint="Lines are parsed as ingredients. Headers, steps, and amounts are kept verbatim in the original."
              >
                <Textarea
                  id="recipe-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the full recipe here. For example:&#10;Meen Kuzhambu&#10;Fish 500g&#10;Tamarind, a lime-sized ball&#10;Fenugreek seeds 1 tsp&#10;Fenugreek leaves, a handful&#10;..."
                  rows={5}
                  autoGrow
                  disabled={submitting}
                />
              </Field>
            </form>
          )}

          {mode === 'form' && (
            <FormIntake
              ref={formRef}
              signedIn={signedIn}
              accountId={accountId}
              onParsed={onParsed}
              onBusyChange={setFormSubmitting}
            />
          )}

          {mode === 'photo' && (
            <div>
              <p className="text-small text-muted">
                Upload a photo of a handwritten or printed recipe card. JPEG or PNG, up to 10 MB.
              </p>

              <label
                htmlFor="recipe-photo"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`mt-4 block cursor-pointer rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
                  dragging
                    ? 'border-accent bg-accent/10'
                    : 'border-border-strong hover:border-accent hover:bg-accent/5'
                }`}
              >
                {previewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Selected recipe card"
                      className="mx-auto max-h-48 w-full rounded-md border border-border bg-background object-contain"
                    />
                    <span className="mt-2 block truncate text-caption text-faint">
                      {file?.name}
                    </span>
                  </>
                ) : (
                  <>
                    <Camera size={24} aria-hidden="true" className="mx-auto text-muted" />
                    <span className="mt-2 block text-small font-semibold text-ink">
                      Drop a photo here, or click to choose a file
                    </span>
                    <span className="mt-1 block text-caption text-faint">
                      JPEG or PNG, up to 10 MB
                    </span>
                  </>
                )}
                <input
                  id="recipe-photo"
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-label="Choose recipe photo"
                  onChange={onFileChange}
                  disabled={uploading}
                  className="sr-only"
                />
              </label>

              {uploadError && (
                <div className="mt-3">
                  <Alert tone="error" title="Could not read the photo">
                    {uploadError}
                  </Alert>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void upload()}
                    disabled={uploading || !file}
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* One shared footer — the single entry point for all three tabs. */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-canvas/40 px-5 py-4">
          <Button
            size="lg"
            onClick={handleFooterSubmit}
            disabled={submitting || uploading || formSubmitting}
          >
            {submitting || uploading || formSubmitting ? 'Working…' : 'Analyze recipe'}
          </Button>
          {footerError && (
            <span className="text-small text-negative" role="alert">
              {footerError}
            </span>
          )}
          <span className="text-caption text-faint">
            Parses or uploads first — review and analysis come next.
          </span>
        </div>
        </div>

        {/* Formatting tips — fills the blank space on large screens only. */}
        <aside className="hidden lg:block" aria-label="Formatting tips">
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <Lightbulb size={18} aria-hidden="true" className="text-accent" weight="bold" />
              <h2 className="font-display text-h3 text-ink">Formatting tips</h2>
            </div>
            <p className="mt-1 text-caption text-muted">Match this pattern for a clean parse.</p>

            <div className="mt-4 rounded-md border border-positive/30 bg-positive/10 p-3">
              <p className="flex items-center gap-1.5 text-caption font-semibold text-positive">
                <Check size={14} aria-hidden="true" weight="bold" />
                Good
              </p>
              <pre className="mt-1.5 whitespace-pre-line font-mono text-caption leading-relaxed text-ink">
                {'500g fish\n1 tsp fenugreek seeds\na handful curry leaves'}
              </pre>
            </div>

            <div className="mt-3 rounded-md border border-positive/30 bg-positive/10 p-3">
              <p className="flex items-center gap-1.5 text-caption font-semibold text-positive">
                <Check size={14} aria-hidden="true" weight="bold" />
                Good
              </p>
              <pre className="mt-1.5 whitespace-pre-line font-mono text-caption leading-relaxed text-ink">
                {'Tamarind, a lime-sized ball'}
              </pre>
            </div>

            <div className="mt-3 rounded-md border border-negative/30 bg-negative/10 p-3">
              <p className="flex items-center gap-1.5 text-caption font-semibold text-negative">
                <X size={14} aria-hidden="true" weight="bold" />
                Avoid
              </p>
              <pre className="mt-1.5 whitespace-pre-line font-mono text-caption leading-relaxed text-ink">
                {'Fish (some, not too much)'}
              </pre>
              <p className="mt-1 text-caption text-muted">
                No amount to extract — give a quantity or unit.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {!signedIn && (
        <p className="mt-8 text-small text-muted">
          As a guest you can paste, fill the structured form, or upload a photo and see the
          extracted lines. Reviewing and analysing need an account: sign up and your guest recipes
          are claimed automatically.
        </p>
      )}
    </div>
  );
}
