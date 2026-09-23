'use client';

// Create recipe: text/paste AND photo upload intake. The photo path posts the
// card image to POST /recipes/upload (Intake photo → OCR → draft); OCR runs
// behind the provider-neutral ocr-adapter (Q10 stays OPEN). The returned draft
// lines carry ocr_confidence + needs_review so the review surface can flag
// low-confidence lines before analysis.

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, Files, Lightbulb, X } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Input';
import { Heading, Text } from '@/components/ui/Typography';
import { api, apiUpload, ApiError } from '@/lib/api';
import type { DocumentIngestionResponse, ParseTextResponse, UploadResponse, WireLine } from '@/lib/types';
import { previewOf, recordSessionRecipe } from '@/lib/flow';
import { FormIntake, FormIntakeHandle } from '@/components/app/FormIntake';

export interface CreateViewProps {
  signedIn: boolean;
  /** The current identity's accountId (null when guest). */
  accountId: string | null;
  /** The intake tab to open on (deep links from the Home entry modes). */
  initialMode?: 'paste' | 'form' | 'photo' | 'upload';
  onBack: () => void;
  onParsed: (recipeId: string, lines: WireLine[], servings?: number | null) => void;
  /** D-11 (B2): navigate after a completed photo upload, with the OCR draft and
   *  the card's transcribed title (null when the card has none). */
  onUploaded: (recipeId: string, lines: WireLine[], title?: string | null, servings?: number | null) => void;
  /** Phase 3: navigate to the source-faithful draft review for a document. */
  onOpenDraftReview: (ingestionId: string, originalFilename: string) => void;
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Phase 1 bulk-upload document scope — the only formats the Upload tab
 *  accepts (Phase 2 will parse these; no parsing happens yet). */
const BULK_DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.txt'];
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

interface BulkFileItem {
  key: string;
  file: File;
  status:
    | 'pending'
    | 'uploading'
    | 'extracting'
    | 'ready'
    | 'extracting_structure'
    | 'draft_ready'
    | 'failed';
  /** Set once the Phase 2 upload succeeds (the Phase 3 extract action needs it). */
  ingestionId?: string;
  error?: string;
}

function bulkStatusLabel(item: BulkFileItem): string {
  switch (item.status) {
    case 'uploading':
      return 'Uploading…';
    case 'extracting':
    case 'extracting_structure':
      return 'Extracting…';
    case 'ready':
      return 'Ready for recipe extraction';
    case 'draft_ready':
      return 'Draft ready';
    case 'failed':
      return item.error ?? 'Failed';
    case 'pending':
      return 'Ready to upload';
  }
}

function bulkStatusTint(status: BulkFileItem['status']): string {
  switch (status) {
    case 'ready':
    case 'draft_ready':
      return 'text-positive';
    case 'failed':
      return 'text-negative';
    case 'uploading':
    case 'extracting':
    case 'extracting_structure':
      return 'text-muted';
    case 'pending':
      return 'text-faint';
  }
}

export function CreateView({
  signedIn,
  accountId,
  initialMode,
  onBack,
  onParsed,
  onUploaded,
  onOpenDraftReview,
}: CreateViewProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // D-10A (B5): text/paste vs structured form vs photo — paste stays the default.
  const [mode, setMode] = useState<'paste' | 'form' | 'photo' | 'upload'>(initialMode ?? 'paste');

  // Photo upload state (D-11 B2).
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Phase 2 bulk-upload state: selected documents with per-file lifecycle.
  const [bulkFiles, setBulkFiles] = useState<BulkFileItem[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkDragging, setBulkDragging] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const bulkKeyRef = useRef(0);
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
      onParsed(result.recipe_id, result.recipe.lines, result.recipe.servings ?? null);
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

  /** Phase 2: accumulate selected documents (validation only — no processing here). */
  const addBulkFiles = (incoming: File[]): void => {
    setBulkError(null);
    const accepted = incoming.filter(
      (f) => BULK_DOCUMENT_EXTENSIONS.includes(fileExtension(f.name)) && f.size <= MAX_DOCUMENT_BYTES,
    );
    const skipped = incoming.length - accepted.length;
    if (skipped > 0) {
      setBulkError(
        skipped === 1
          ? 'One file was skipped — only PDF, DOCX, or TXT files up to 10 MB are accepted.'
          : `${skipped} files were skipped — only PDF, DOCX, or TXT files up to 10 MB are accepted.`,
      );
    }
    if (accepted.length > 0) {
      setBulkFiles((prev) => [
        ...prev,
        ...accepted.map((file) => ({
          key: `bulk-${Date.now()}-${bulkKeyRef.current++}`,
          file,
          status: 'pending' as const,
        })),
      ]);
    }
  };

  const onBulkChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    addBulkFiles(Array.from(e.target.files ?? []));
  };

  const removeBulkFile = (key: string): void => {
    setBulkFiles((prev) => prev.filter((f) => f.key !== key));
  };

  const setBulkItem = (key: string, patch: Partial<BulkFileItem>): void => {
    setBulkFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  /** Poll one document's lifecycle until it reaches the target (ready/draft_ready). */
  const pollIngestion = async (
    ingestionId: string,
    key: string,
    target: 'ready' | 'draft_ready',
  ): Promise<void> => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const status = await api<DocumentIngestionResponse>(
          `/recipes/import/documents/${ingestionId}`,
        );
        if (status.status === target) {
          setBulkItem(key, { status: target, error: undefined });
          return;
        }
        if (status.status === 'failed' || status.status === 'extraction_failed') {
          setBulkItem(key, {
            status: 'failed',
            error: status.error_message ?? 'Document extraction failed.',
          });
          return;
        }
      } catch {
        // transient poll error — retry next tick
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    // The target-specific message disambiguates a slow/absent worker (ingestion
    // never leaves `queued`) from a slow LLM extraction (draft never appears).
    setBulkItem(key, {
      status: 'failed',
      error:
        target === 'ready'
          ? 'Timed out waiting for the document to be processed. Retry — if this repeats, the worker may be down.'
          : 'Timed out waiting for recipe extraction. Retry — the draft may still be generating.',
    });
  };

  /** Upload one document independently — a failure here never affects others. */
  const uploadOneDocument = async (item: BulkFileItem): Promise<void> => {
    setBulkItem(item.key, { status: 'uploading', error: undefined });
    try {
      const form = new FormData();
      form.append('file', item.file);
      const result = await apiUpload<DocumentIngestionResponse>('/recipes/import/documents', form);
      setBulkItem(item.key, {
        status: 'extracting',
        ingestionId: result.ingestion_id,
        error: undefined,
      });
      await pollIngestion(result.ingestion_id, item.key, 'ready');
    } catch (err) {
      setBulkItem(item.key, {
        status: 'failed',
        error:
          err instanceof ApiError
            ? err.message
            : 'The server could not be reached. Check your connection and try again.',
      });
    }
  };

  /** Phase 3: trigger source-faithful structured extraction on a ready document. */
  const extractOneDocument = async (item: BulkFileItem): Promise<void> => {
    if (!item.ingestionId) return;
    setBulkItem(item.key, { status: 'extracting_structure', error: undefined });
    try {
      // A prior upload/extract may have stopped at any lifecycle point — resume
      // from wherever the document actually is instead of assuming `ready`.
      const current = await api<DocumentIngestionResponse>(
        `/recipes/import/documents/${item.ingestionId}`,
      );
      if (current.status === 'failed') {
        setBulkItem(item.key, {
          status: 'failed',
          error: current.error_message ?? 'Document ingestion failed.',
        });
        return;
      }
      if (current.status === 'draft_ready') {
        setBulkItem(item.key, { status: 'draft_ready', error: undefined });
        return;
      }
      if (current.status === 'queued' || current.status === 'extracting') {
        await pollIngestion(item.ingestionId, item.key, 'ready');
      }
      if (current.status === 'extracting_structure') {
        await pollIngestion(item.ingestionId, item.key, 'draft_ready');
        return;
      }

      await api<DocumentIngestionResponse>(
        `/recipes/import/documents/${item.ingestionId}/extract`,
        { method: 'POST' },
      );
      await pollIngestion(item.ingestionId, item.key, 'draft_ready');
    } catch (err) {
      setBulkItem(item.key, {
        status: 'failed',
        error:
          err instanceof ApiError
            ? err.message
            : 'Extraction failed. Check your connection and try again.',
      });
    }
  };

  const uploadBulk = async (): Promise<void> => {
    const pending = bulkFiles.filter((f) => f.status === 'pending');
    if (pending.length === 0) {
      setFooterError('No documents are waiting to upload.');
      return;
    }
    setBulkUploading(true);
    await Promise.all(pending.map((item) => uploadOneDocument(item)));
    setBulkUploading(false);
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
    } else if (mode === 'upload') {
      void uploadBulk();
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
      const title = result.title?.trim() || null;
      recordSessionRecipe(
        result.recipe_id,
        title ?? `Photo: ${file.name}`,
        signedIn && accountId ? { kind: 'user', accountId } : { kind: 'guest' },
        result.lines,
      );
      onUploaded(result.recipe_id, result.lines, title, result.servings ?? null);
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

      <div className="relative mt-6 overflow-hidden rounded-[1.25rem] border border-border shadow-whisper">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/create-banner.jpg"
          alt=""
          className="h-52 w-full object-cover object-center sm:h-60"
          loading="lazy"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(242,239,228,0.96)_0%,rgba(242,239,228,0.78)_44%,transparent_72%)]"
        />
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-md px-6 sm:px-8">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-accent">
              Recipe intake
            </p>
            <h2 className="mt-2 font-display text-h2 text-ink">One recipe, any format</h2>
            <p className="mt-1.5 text-small text-body">
              Paste text, fill a structured form, or photograph a card — ingredients, method and
              nutrition are extracted for you to review.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div
          className="flex gap-1.5 overflow-x-auto border-b border-border px-5 py-3"
          role="tablist"
          aria-label="Input mode"
        >
          {(
            [
              ['paste', 'Paste text'],
              ['form', 'Structured form'],
              ['photo', 'Photo'],
              ['upload', 'Upload'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-small font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                mode === key
                  ? 'bg-accent text-surface hover:bg-accent-strong'
                  : 'text-muted hover:bg-ink/5 hover:text-ink'
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

          {mode === 'upload' && (
            <div>
              <p className="text-small text-muted">
                Select one or more recipe documents to upload in bulk. PDF, DOCX, or TXT, up to 10 MB each.
              </p>

              <label
                htmlFor="bulk-upload"
                onDragOver={(e) => {
                  e.preventDefault();
                  setBulkDragging(true);
                }}
                onDragLeave={() => setBulkDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setBulkDragging(false);
                  addBulkFiles(Array.from(e.dataTransfer.files ?? []));
                }}
                className={`mt-4 block cursor-pointer rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
                  bulkDragging
                    ? 'border-accent bg-accent/10'
                    : 'border-border-strong hover:border-accent hover:bg-accent/5'
                }`}
              >
                <Files size={24} aria-hidden="true" className="mx-auto text-muted" />
                <span className="mt-2 block text-small font-semibold text-ink">
                  Drop documents here, or click to choose files
                </span>
                <span className="mt-1 block text-caption text-faint">
                  PDF, DOCX, or TXT, up to 10 MB each — select multiple
                </span>
                <input
                  id="bulk-upload"
                  type="file"
                  accept=".pdf,.docx,.txt"
                  multiple
                  aria-label="Choose recipe documents"
                  onChange={onBulkChange}
                  className="sr-only"
                />
              </label>

              {bulkError && (
                <div className="mt-3">
                  <Alert tone="error" title="Some files were skipped">
                    {bulkError}
                  </Alert>
                </div>
              )}

              {bulkFiles.length > 0 && (
                <ul className="mt-4 space-y-2" aria-label="Selected files">
                  {bulkFiles.map((item) => (
                    <li
                      key={item.key}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-canvas px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-small text-ink">{item.file.name}</span>
                        <span className={`mt-0.5 block text-caption ${bulkStatusTint(item.status)}`}>
                          {bulkStatusLabel(item)}
                        </span>
                      </div>
                      {item.status === 'ready' && (
                        <Button size="sm" onClick={() => void extractOneDocument(item)}>
                          Extract recipe
                        </Button>
                      )}
                      {item.status === 'draft_ready' && (
                        <Button
                          size="sm"
                          onClick={() => onOpenDraftReview(item.ingestionId!, item.file.name)}
                        >
                          Review
                        </Button>
                      )}
                      {item.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void (item.ingestionId ? extractOneDocument(item) : uploadOneDocument(item))
                          }
                        >
                          Retry
                        </Button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeBulkFile(item.key)}
                        aria-label={`Remove ${item.file.name}`}
                        disabled={
                          item.status === 'uploading' ||
                          item.status === 'extracting' ||
                          item.status === 'extracting_structure'
                        }
                        className="inline-flex shrink-0 items-center rounded-sm text-faint hover:text-negative disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* One shared footer — the single entry point for all three tabs. */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-canvas/40 px-5 py-4">
          <Button
            size="lg"
            onClick={handleFooterSubmit}
            disabled={submitting || uploading || formSubmitting || bulkUploading}
          >
            {submitting || uploading || formSubmitting
              ? 'Working…'
              : bulkUploading
                ? 'Uploading…'
                : mode === 'upload'
                  ? 'Upload documents'
                  : 'Analyze recipe'}
          </Button>
          {footerError && (
            <span className="text-small text-negative" role="alert">
              {footerError}
            </span>
          )}
          <span className="text-caption text-faint">
            {mode === 'upload'
              ? 'Each document is extracted to source-faithful text — recipe extraction comes in a later phase.'
              : 'Parses or uploads first — review and analysis come next.'}
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
