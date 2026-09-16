'use client';

// Create recipe: text/paste AND photo upload intake. The photo path posts the
// card image to POST /recipes/upload (Intake photo → OCR → draft); OCR runs
// behind the provider-neutral ocr-adapter (Q10 stays OPEN). The returned draft
// lines carry ocr_confidence + needs_review so the review surface can flag
// low-confidence lines before analysis.

import { useEffect, useState } from 'react';
import { ArrowLeft, Camera } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Input';
import { Heading, Text } from '@/components/ui/Typography';
import { api, apiUpload, ApiError } from '@/lib/api';
import type { ParseTextResponse, UploadResponse, WireLine } from '@/lib/types';
import { previewOf, recordSessionRecipe } from '@/lib/flow';
import { FormIntake } from '@/components/app/FormIntake';

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

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const selected = e.target.files?.[0] ?? null;
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
    <div className="mx-auto max-w-3xl">
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

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
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
                  rows={14}
                  disabled={submitting}
                />
              </Field>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button type="submit" size="lg" disabled={submitting || text.trim().length === 0}>
                  {submitting ? 'Parsing...' : 'Parse and review'}
                </Button>
                <p className="text-caption text-faint">Takes a few seconds.</p>
              </div>
            </form>
          )}

          {mode === 'form' && (
            <FormIntake signedIn={signedIn} accountId={accountId} onParsed={onParsed} />
          )}

          {mode === 'photo' && (
            <div>
              <p className="text-small text-muted">
                Upload a photo of a handwritten or printed recipe card. JPEG or PNG, up to 10 MB.
              </p>

              <label
                htmlFor="recipe-photo"
                className="mt-4 block cursor-pointer rounded-lg border-2 border-dashed border-border-strong p-5 text-center transition-colors hover:border-accent hover:bg-accent/5"
              >
                <Camera size={24} aria-hidden="true" className="mx-auto text-muted" />
                <span className="mt-2 block text-small font-semibold text-ink">
                  Drop a photo here, or click to choose a file
                </span>
                <span className="mt-1 block text-caption text-faint">
                  {file ? file.name : 'No file chosen'}
                </span>
                <input
                  id="recipe-photo"
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-label="Choose recipe photo"
                  onChange={onFileChange}
                  disabled={uploading}
                  className="mt-3 block w-full text-small text-body file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-background file:px-3 file:py-1.5 file:text-small file:font-semibold file:text-ink"
                />
              </label>

              {previewUrl && (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Selected recipe card"
                    className="max-h-48 w-full rounded-md border border-border bg-background object-contain"
                  />
                </div>
              )}

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

              <div className="mt-4">
                <Button onClick={() => void upload()} disabled={uploading || !file}>
                  {uploading ? 'Uploading photo & reading the card…' : 'Upload photo'}
                </Button>
              </div>
            </div>
          )}
        </div>
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
