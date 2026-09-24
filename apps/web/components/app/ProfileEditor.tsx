'use client';

// D-26 (P7-2) H1 — the household restriction profile editor (API §9). Allergens
// use the CANONICAL codes from GET /restriction-vocabulary; diet patterns use the
// LABELED PILOT vocabulary (vegetarian / vegan / gluten-free — ERD §15 OPEN,
// recorded in HANDOFF). The profile is optional (TC-02) and NEVER auto-deletes
// recipes (TC-03 — there is no delete path anywhere).

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { RestrictionProfile, RestrictionVocabulary } from '@/lib/types';
import { Button } from '@/components/ui/Button';

export function ProfileEditor() {
  const [profile, setProfile] = useState<RestrictionProfile | null>(null);
  const [vocabulary, setVocabulary] = useState<RestrictionVocabulary | null>(null);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [labelPack, setLabelPack] = useState<'US' | 'EU'>('US');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profileWire, vocabularyWire] = await Promise.all([
        api<RestrictionProfile>('/me/restriction-profile'),
        api<RestrictionVocabulary>('/restriction-vocabulary'),
      ]);
      setProfile(profileWire);
      setVocabulary(vocabularyWire);
      setAllergens(profileWire.allergens);
      setPatterns(profileWire.diet_patterns);
      setLabelPack(profileWire.label_pack ?? 'US');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the restriction profile');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleAllergen = (code: string): void => {
    setAllergens((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const togglePattern = (pattern: string): void => {
    setPatterns((prev) =>
      prev.includes(pattern) ? prev.filter((p) => p !== pattern) : [...prev, pattern],
    );
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const wire = await api<RestrictionProfile>('/me/restriction-profile', {
        method: 'PUT',
        body: JSON.stringify({
          allergens,
          diet_patterns: patterns,
          label_pack: labelPack,
        }),
      });
      setProfile(wire);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the restriction profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {!profile || !vocabulary ? (
        <p className="text-caption text-muted">Loading…</p>
      ) : (
        <div>
          <p className="text-caption font-semibold text-ink">Allergens</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {vocabulary.allergens.map((allergen) => (
              <button
                key={allergen.code}
                type="button"
                aria-pressed={allergens.includes(allergen.code)}
                onClick={() => toggleAllergen(allergen.code)}
                className={
                  allergens.includes(allergen.code)
                    ? 'rounded-md border border-accent bg-accent/10 px-2 py-1 text-caption max-lg:min-h-11 font-semibold text-ink'
                    : 'rounded-md border border-border px-2 py-1 text-caption max-lg:min-h-11 text-muted hover:text-ink'
                }
              >
                {allergen.name}
              </button>
            ))}
          </div>

          <p className="mt-3 text-caption font-semibold text-ink">Diet patterns (pilot vocabulary)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {vocabulary.diet_patterns.map((pattern) => (
              <button
                key={pattern}
                type="button"
                aria-pressed={patterns.includes(pattern)}
                onClick={() => togglePattern(pattern)}
                className={
                  patterns.includes(pattern)
                    ? 'rounded-md border border-accent bg-accent/10 px-2 py-1 text-caption max-lg:min-h-11 font-semibold text-ink'
                    : 'rounded-md border border-border px-2 py-1 text-caption max-lg:min-h-11 text-muted hover:text-ink'
                }
              >
                {pattern}
              </button>
            ))}
          </div>

          <p className="mt-3 text-caption font-semibold text-ink">Label pack</p>
          <div role="radiogroup" aria-label="Label pack" className="mt-2 flex gap-2">
            {(['US', 'EU'] as const).map((pack) => (
              <button
                key={pack}
                type="button"
                role="radio"
                aria-checked={labelPack === pack}
                onClick={() => setLabelPack(pack)}
                className={
                  labelPack === pack
                    ? 'rounded-md border border-accent bg-accent/10 px-3 py-1 text-small font-semibold text-ink'
                    : 'rounded-md border border-border px-3 py-1 text-small text-muted hover:text-ink'
                }
              >
                {pack}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save profile'}
            </Button>
            {saved && <span className="ml-3 text-caption font-semibold text-ink">Profile saved.</span>}
          </div>
          {error && <p className="mt-2 text-caption text-negative">{error}</p>}
        </div>
      )}
    </div>
  );
}
