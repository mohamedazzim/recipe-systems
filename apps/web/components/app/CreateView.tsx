'use client';

// Create recipe: the text/paste intake path (the only live input channel —
// OCR/Q10 deferred). Photo is shown as a clearly disabled "coming soon" card,
// never presented as functional.

import { useState } from 'react';
import { ArrowLeft, Camera } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Input';
import { Heading, Text } from '@/components/ui/Typography';
import { api, ApiError } from '@/lib/api';
import type { ParseTextResponse } from '@/lib/types';
import { previewOf, recordSessionRecipe } from '@/lib/flow';

export interface CreateViewProps {
  signedIn: boolean;
  onBack: () => void;
  onParsed: (recipeId: string) => void;
}

export function CreateView({ signedIn, onBack, onParsed }: CreateViewProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (text.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api<ParseTextResponse>('/recipes/parse-text', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      recordSessionRecipe(result.recipe_id, previewOf(text));
      onParsed(result.recipe_id);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('The server could not be reached. Check your connection and try again.');
      }
      setSubmitting(false);
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
        Back to your recipes
      </button>

      <Heading level={1} className="mt-5">
        Add a recipe
      </Heading>
      <Text className="mt-2 text-muted">
        Paste the recipe text. The original stays preserved exactly as you entered it; the
        structured lines are extracted for review next.
      </Text>

      {error && (
        <div className="mt-6">
          <Alert tone="error" title="Could not add the recipe">
            {error}
          </Alert>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_260px]">
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

        <aside aria-label="Other input options">
          <div
            className="rounded-lg border border-border p-5 opacity-70"
            aria-disabled="true"
          >
            <Camera size={22} aria-hidden="true" className="text-muted" />
            <p className="mt-3 font-semibold text-ink">Photo capture</p>
            <p className="mt-1 text-small text-muted">Coming soon.</p>
          </div>
        </aside>
      </div>

      {!signedIn && (
        <p className="mt-8 text-small text-muted">
          As a guest you can paste and see the parsed lines. Reviewing and analysing need an
          account: sign up and your guest recipes are claimed automatically.
        </p>
      )}
    </div>
  );
}
