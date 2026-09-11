'use client';

// D-18 + D-19 (P3-4/P4-1): the real analysis result — identification + the nine
// views in home mode, rendered from the persisted analysis_view payloads. Claim
// tags are visible (C4); the View 2 blind spot is shown as required output,
// never "fixed". Views 8/9 are the deterministic D-19 surfaces: H6/I6 disclaimers
// verbatim on every View 8/9 surface; View 9 assumptions (I2) edit → recompute.
// No content is invented: absent/unavailable views show honest empty states.

import { useState } from 'react';
import { Badge, Tag } from '@/components/ui/Badge';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { StationCard, NoStationCard } from '@/components/app/StationCard';
import {
  displayDuration,
  identificationFrom,
  resolveIngredientName,
  view1Payload,
  view2Payload,
  view3Payload,
  view4Payload,
  view5Payload,
  view6Payload,
  view7Payload,
  view8Payload,
  view9Payload,
} from '@/lib/views';
import type { AnalysisState, MethodState, WireLine } from '@/lib/types';
import type { View9Payload } from '@recipe-systems/schemas';

export interface AnalysisViewsProps {
  analysis: AnalysisState;
  /** Current draft lines for ingredient-name resolution (the persisted name source). */
  lines: WireLine[];
  /** D-13 method wire state for the inferred-source display (fallback: tag only). */
  methodState: MethodState | null;
  /** Bearer-only assumption editors (RS-US-45): hidden for guests. */
  signedIn?: boolean;
  /** Manual re-read of the analysis (D-19 recompute). */
  onRefresh?: () => Promise<void>;
  /** D-20 (C3): home explains, chef briefs — same nine views, different framing. */
  mode?: 'home' | 'chef';
  /** D-23 (P5-2): the owning recipe id — enables the print surface. */
  recipeId?: string;
}

/** §7 Home-vs-chef framing per view (table column mapping; content transformation
 *  awaits the real LLM — Q9 OPEN; headers only, nothing invented). */
const CHEF_TAB_LABELS: Record<string, string> = {
  'view-1': '1 · Job + failure if omitted',
  'view-2': '2 · Diagnostic',
  'view-3': '3 · Sequence, heat, cue',
  'view-4': '4 · Structural / modular',
  'view-5': '5 · Neighbour swaps',
  'view-6': '6 · Working ratios',
  'view-7': '7 · Texture + hold',
  'view-8': '8 · Allergen brief',
  'view-9': '9 · Assumption log',
};

export function AnalysisViews({
  analysis,
  lines,
  methodState,
  signedIn = false,
  onRefresh = async () => undefined,
  mode = 'home',
  recipeId,
}: AnalysisViewsProps) {
  const [activeView, setActiveView] = useState('view-1');
  const byNumber = new Map(analysis.views.map((v) => [v.view_number, v]));
  const view = (n: number) => byNumber.get(n) ?? null;

  const identification = identificationFrom(
    view(5) ? view5Payload(view(5)?.payload ?? null) : null,
  );

  const tabs = [
    { id: 'view-1', label: '1 · Why it works', content: renderView1(view(1), lines) },
    { id: 'view-2', label: '2 · Balance', content: renderView2(view(2), lines) },
    { id: 'view-3', label: '3 · Process', content: renderView3(view(3), lines) },
    { id: 'view-4', label: '4 · Substitutions', content: renderView4(view(4), lines) },
    { id: 'view-5', label: '5 · Regional', content: renderView5(view(5)) },
    { id: 'view-6', label: '6 · Ratios', content: renderView6(view(6)) },
    { id: 'view-7', label: '7 · Sensory', content: renderView7(view(7)) },
    {
      id: 'view-8',
      label: '8 · Dietary',
      content: renderView8(view(8)),
    },
    {
      id: 'view-9',
      label: '9 · Nutrition',
      content: renderView9(view(9), analysis.analysis_id, signedIn, onRefresh),
    },
  ].map((t) => ({
    ...t,
    label: mode === 'chef' ? (CHEF_TAB_LABELS[t.id] ?? t.label) : t.label,
  }));

  return (
    <section aria-labelledby="result-heading" className="mt-4">
      <h2 id="result-heading" className="sr-only">
        Analysis result
      </h2>

      {identification ? (
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="eyebrow">Identification</p>
          <p className="mt-2 font-display text-h2 text-ink">{identification.family}</p>
          <p className="mt-1 max-w-prose text-body">{identification.architecture}</p>
          <p className="mt-3 inline-flex items-center gap-2 text-small font-semibold text-body">
            Confidence: {identification.confidence}
            <Badge tag="INFERRED">
              {methodState?.method_source
                ? `Inferred from ${methodState.method_source}`
                : 'Inferred'}
            </Badge>
          </p>
          {identification.not_this.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-small font-semibold text-ink">Not this</p>
              <ul className="mt-1 space-y-1 text-small text-body">
                {identification.not_this.map((n) => (
                  <li key={n.variant}>
                    <span className="font-semibold">{n.variant}</span>
                    {n.key_difference ? `: ${n.key_difference}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <Alert tone="info" title="Identification not available">
          This analysis has no identification content yet.
        </Alert>
      )}

      <div className="mt-6">
        {mode === 'chef' && (
          <div className="mb-6">
            {analysis.station_card ? (
              <StationCard card={analysis.station_card} recipeId={recipeId} />
            ) : (
              <NoStationCard />
            )}
          </div>
        )}
        <Tabs
          tabs={tabs.map((t) => ({ id: t.id, label: t.label }))}
          active={activeView}
          onSelect={setActiveView}
          label="Analysis views"
        />
        {tabs.map((t) => (
          <TabPanel key={t.id} id={t.id} active={activeView}>
            <div className="mt-5">{t.content}</div>
          </TabPanel>
        ))}
      </div>
    </section>
  );
}

interface ViewRow {
  view_number: number;
  view_key: string;
  status: 'COMPLETE' | 'INCOMPLETE';
  payload: unknown;
}

function renderView1(row: ViewRow | null, lines: WireLine[]): React.ReactNode {
  if (!row) return <UnavailableView label="View 1: Why each ingredient exists" />;
  const payload = view1Payload(row.payload);
  if (!payload || row.status !== 'COMPLETE') return <IncompleteView label="View 1" />;
  const name = (id: string) => resolveIngredientName(id, lines);
  return (
    <div>
      <p className="text-small text-muted">
        Why each ingredient exists, and what changes without it.
      </p>
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
        {payload.items.map((item) => (
          <li key={item.ingredient_id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">{name(item.ingredient_id)}</span>
              <Badge tag={item.tag as Tag} />
            </div>
            <p className="mt-1 text-small text-body">
              {item.job}
              {item.if_omitted ? `. Without it: ${item.if_omitted}` : ''}
            </p>
          </li>
        ))}
      </ul>
      {payload.role_groups.length > 0 && (
        <div className="mt-5">
          <p className="text-small font-semibold text-ink">How they sit together</p>
          <ul className="mt-2 space-y-2">
            {payload.role_groups.map((group) => (
              <li key={group.role} className="text-small text-body">
                <span className="font-semibold text-ink">{group.role}:</span>{' '}
                {group.ingredient_ids.map(name).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function renderView2(row: ViewRow | null, lines: WireLine[]): React.ReactNode {
  if (!row) return <UnavailableView label="View 2: Balance" />;
  const payload = view2Payload(row.payload);
  if (!payload || row.status !== 'COMPLETE') return <IncompleteView label="View 2" />;
  const name = (id: string) => resolveIngredientName(id, lines);
  return (
    <div>
      <p className="text-small text-muted">The friendly balance table.</p>
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
        {payload.pillars.map((pillar) => (
          <li key={pillar.pillar} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">{pillar.pillar}</span>
              <Badge tag={pillar.tag as Tag} />
            </div>
            <p className="mt-1 text-small text-body">
              {pillar.source_ingredient_ids.map(name).join(', ')}
            </p>
            <p className="mt-0.5 text-small text-muted">
              Without it: {pillar.if_missing}
            </p>
          </li>
        ))}
      </ul>
      {payload.blind_spot_notes.length > 0 && (
        <div className="mt-5">
          <Alert tone="warning" title="Blind spot of this method">
            {payload.blind_spot_notes.map((note) => (
              <p key={note.ingredient_id}>
                <span className="font-semibold">{name(note.ingredient_id)}</span>: {note.note}
              </p>
            ))}
          </Alert>
        </div>
      )}
    </div>
  );
}

function renderView3(row: ViewRow | null, lines: WireLine[]): React.ReactNode {
  if (!row) return <UnavailableView label="View 3: Process" />;
  const payload = view3Payload(row.payload);
  if (!payload || payload.status !== 'COMPLETE') {
    return (
      <div>
        <Alert tone="info" title="Process incomplete">
          {payload?.incomplete_reason ??
            'No process was generated for this analysis. The method is required for View 3.'}
        </Alert>
      </div>
    );
  }
  void lines;
  return (
    <div>
      <p className="text-small text-muted">The narrative walkthrough, in order.</p>
      <ol className="mt-4 space-y-4">
        {payload.stages.map((stage, index) => (
          <li key={`${stage.stage_name}-${index}`} className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">{stage.stage_name}</span>
              <Badge tag={stage.tag as Tag} />
            </div>
            <p className="mt-1 text-small text-body">{stage.action}</p>
            <p className="mt-0.5 text-small text-muted">
              Cue: {stage.cue}
              {displayDuration(stage.duration) ? `. About ${displayDuration(stage.duration)}.` : ''}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function renderView4(row: ViewRow | null, lines: WireLine[]): React.ReactNode {
  if (!row) return <UnavailableView label="View 4: Substitutions" />;
  const payload = view4Payload(row.payload);
  if (!payload || row.status !== 'COMPLETE') return <IncompleteView label="View 4" />;
  const name = (id: string) => resolveIngredientName(id, lines);
  return (
    <div>
      <p className="text-small text-muted">What you can skip, and what to swap instead.</p>
      {payload.substitutions.length === 0 ? (
        <p className="mt-4 text-small text-body">No substitutions were generated for this recipe.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
          {payload.substitutions.map((sub, index) => (
            <li key={`${sub.ingredient_id}-${index}`} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">
                  {name(sub.ingredient_id)} → {sub.substitute}
                </span>
                <Badge tag="INFERRED" />
              </div>
              <p className="mt-1 text-small text-body">{sub.consequence}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function renderView5(row: ViewRow | null): React.ReactNode {
  if (!row) return <UnavailableView label="View 5: Regional context" />;
  const payload = view5Payload(row.payload);
  if (!payload || row.status !== 'COMPLETE') return <IncompleteView label="View 5" />;
  return (
    <div>
      <p className="text-small text-muted">
        The regional reading of this card — compare, keep, negotiate.
      </p>
      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <p className="font-semibold text-ink">{payload.family}</p>
        <p className="mt-1 text-small text-body">{payload.architecture}</p>
        <p className="mt-2 inline-flex items-center gap-2 text-small font-semibold text-body">
          Confidence: {payload.confidence}
          <Badge tag={payload.tag as Tag} />
        </p>
        {payload.not_this.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-small font-semibold text-ink">Near neighbours — and the tell</p>
            <ul className="mt-1 space-y-1 text-small text-body">
              {payload.not_this.map((n) => (
                <li key={n.variant}>
                  <span className="font-semibold">{n.variant}</span>
                  {n.key_difference ? `: ${n.key_difference}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Alert tone="info" title="Regional note pending review">
        View 5 is always flagged for a regional reviewer (G2). It may be corrected after
        review.
      </Alert>
    </div>
  );
}

function renderView6(row: ViewRow | null): React.ReactNode {
  if (!row) return <UnavailableView label="View 6: Ratios" />;
  const payload = view6Payload(row.payload);
  if (!payload || row.status !== 'COMPLETE') return <IncompleteView label="View 6" />;
  return (
    <div>
      <p className="text-small text-muted">Ratios that hold the architecture together.</p>
      {payload.ratios.length === 0 && payload.unresolvable.length === 0 ? (
        <p className="mt-4 text-small text-body">No ratios were computed for this recipe.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
          {payload.ratios.map((ratio, index) => (
            <li key={`${ratio.components}-${index}`} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">
                  {ratio.components}: {ratio.ratio}
                </span>
                <Badge tag={ratio.tag as Tag} />
              </div>
              {ratio.structural && (
                <p className="mt-1 text-small text-muted">Structural — do not move this alone.</p>
              )}
            </li>
          ))}
          {payload.unresolvable.map((u, index) => (
            <li key={`${u.components}-${index}`} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">{u.components}</span>
                <Badge tag={u.tag as Tag} />
              </div>
              <p className="mt-1 text-small text-muted">{u.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function renderView7(row: ViewRow | null): React.ReactNode {
  if (!row) return <UnavailableView label="View 7: Sensory and time" />;
  const payload = view7Payload(row.payload);
  if (!payload || payload.status !== 'COMPLETE') {
    return (
      <Alert tone="info" title="Sensory notes unavailable">
        No process was generated for this analysis. The method is required for View 7.
      </Alert>
    );
  }
  return (
    <div>
      <p className="text-small text-muted">What makes the dish memorable, and why.</p>
      {payload.memorable_elements.length === 0 ? (
        <p className="mt-4 text-small text-body">No memorable elements were generated.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {payload.memorable_elements.map((element, index) => (
            <li key={`${element.element}-${index}`} className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">{element.element}</span>
                <Badge tag={element.tag as Tag} />
              </div>
              <p className="mt-1 text-small text-muted">Grounded in: {element.grounded_in}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function renderView8(row: ViewRow | null): React.ReactNode {
  if (!row) return <UnavailableView label="View 8: Dietary restrictions" />;
  const payload = view8Payload(row.payload);
  if (!payload || row.status !== 'COMPLETE') return <IncompleteView label="View 8" />;
  return (
    <div>
      <p className="text-small text-muted">
        A flag view, not a certificate. Present / not on card / unknown — the card is the only
        source.
      </p>
      <dl className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
        <div className="px-4 py-3">
          <dt className="text-small font-semibold text-ink">Present</dt>
          <dd className="mt-1 text-small text-body">
            {payload.present.length > 0 ? payload.present.join(', ') : 'None detected on the card'}
          </dd>
        </div>
        {payload.not_on_card.length > 0 && (
          <div className="px-4 py-3">
            <dt className="text-small font-semibold text-ink">Not on card</dt>
            <dd className="mt-1 text-small text-body">{payload.not_on_card.join(', ')}</dd>
          </div>
        )}
        {payload.unknown.length > 0 && (
          <div className="px-4 py-3">
            <dt className="text-small font-semibold text-ink">Unknown</dt>
            <dd className="mt-1 text-small text-body">{payload.unknown.join(', ')}</dd>
          </div>
        )}
        <div className="px-4 py-3">
          <dt className="text-small font-semibold text-ink">Print line</dt>
          <dd className="mt-1 text-small text-body">
            Contains:{' '}
            <span className="font-semibold">{payload.allergen_line.contains.join(', ')}</span>
            {payload.allergen_line.notes.map((note) => (
              <span key={note} className="text-muted">
                {' '}
                · {note}
              </span>
            ))}
          </dd>
        </div>
      </dl>
      {payload.removal_notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {payload.removal_notes.map((note) => (
            <li key={note.item} className="text-small text-body">
              <span className="font-semibold">{note.item}:</span> {note.note}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 border-t border-border pt-4 text-caption text-muted">
        {payload.disclaimer}
      </p>
    </div>
  );
}

function renderView9(
  row: ViewRow | null,
  analysisId: string,
  signedIn: boolean,
  onRefresh: () => Promise<void>,
): React.ReactNode {
  if (!row) return <UnavailableView label="View 9: Calories and micronutrients" />;
  const payload = view9Payload(row.payload);
  if (!payload || row.status !== 'COMPLETE') return <IncompleteView label="View 9" />;
  return (
    <div>
      <p className="text-small text-muted">
        A band, never a point. Versioned food-composition data, not model arithmetic.
      </p>
      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <p className="eyebrow">Whole-pot energy</p>
        <p className="mt-1 font-display text-h2 text-ink">
          {payload.band.energy_kcal_min.toLocaleString()}–{payload.band.energy_kcal_max.toLocaleString()}{' '}
          kcal
        </p>
        <dl className="mt-3 grid gap-2 text-small sm:grid-cols-2">
          <div>
            <dt className="text-faint">Protein</dt>
            <dd className="font-semibold text-body">
              {payload.band.protein_g.min}–{payload.band.protein_g.max} g
            </dd>
          </div>
          <div>
            <dt className="text-faint">Fat</dt>
            <dd className="font-semibold text-body">
              {payload.band.fat_g.min}–{payload.band.fat_g.max} g
            </dd>
          </div>
          <div>
            <dt className="text-faint">Carbohydrate</dt>
            <dd className="font-semibold text-body">
              {payload.band.carb_g.min}–{payload.band.carb_g.max} g
            </dd>
          </div>
          <div>
            <dt className="text-faint">Fibre</dt>
            <dd className="font-semibold text-body">
              {payload.band.fibre_g.min}–{payload.band.fibre_g.max} g
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-small font-semibold text-body">Sodium: Unknown</p>
      </div>
      <div className="mt-4">
        <p className="text-small font-semibold text-ink">Assumptions</p>
        <ul className="mt-2 space-y-1 text-small text-body">
          {payload.assumptions.map((assumption, index) => (
            <li key={`${assumption.key}-${index}`} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{assumption.key}:</span>
              <span>{String(assumption.value)}</span>
              <Badge tag={assumption.tag as Tag} />
            </li>
          ))}
        </ul>
      </div>
      {payload.tightening_factors.length > 0 && (
        <p className="mt-3 text-small text-muted">
          What tightens the band: {payload.tightening_factors.join(' · ')}.
        </p>
      )}
      <View9AssumptionEditor
        analysisId={analysisId}
        payload={payload}
        signedIn={signedIn}
        onRefresh={onRefresh}
      />
      <p className="mt-6 border-t border-border pt-4 text-caption text-muted">
        {payload.disclaimer}
      </p>
    </div>
  );
}

function View9AssumptionEditor({
  analysisId,
  payload,
  signedIn,
  onRefresh,
}: {
  analysisId: string;
  payload: View9Payload;
  signedIn: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [fishClass, setFishClass] = useState('');
  const [coconut, setCoconut] = useState('');
  const [oil, setOil] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  if (!signedIn) {
    return (
      <p className="mt-4 text-small text-muted">
        Editing assumptions needs an account. Sign in to adjust fish class, coconut grams, or
        oil tablespoons.
      </p>
    );
  }

  const submit = async (): Promise<void> => {
    const body: Record<string, unknown> = {};
    if (fishClass) body.fish_class = fishClass;
    if (coconut.trim() !== '') body.coconut_grams = Number(coconut);
    if (oil.trim() !== '') body.oil_tbsp = Number(oil);
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api<unknown>(`/analysis/${analysisId}/view-9/assumptions`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setQueued(true);
      setFishClass('');
      setCoconut('');
      setOil('');
      // The worker recomputes asynchronously; the SSE signal triggers the hook's
      // refresh. Fallback refreshes in case SSE is unavailable in the browser.
      const timer = setTimeout(() => void onRefresh(), 1500);
      const timer2 = setTimeout(() => void onRefresh(), 3500);
      const timer3 = setTimeout(() => void onRefresh(), 6000);
      void timer;
      void timer2;
      void timer3;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not recompute the band.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    !saving && (fishClass !== '' || coconut.trim() !== '' || oil.trim() !== '');

  return (
    <div className="mt-5 rounded-lg border border-border bg-surface p-4">
      <p className="text-small font-semibold text-ink">Edit assumptions</p>
      <p className="mt-1 text-caption text-muted">
        Fish class, coconut grams, oil tablespoons — editing recomputes the band (View 9 only;
        the other views are never regenerated).
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field htmlFor="assumption-fish" label="Fish class">
          <select
            id="assumption-fish"
            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-small"
            value={fishClass}
            onChange={(e) => setFishClass(e.target.value)}
          >
            <option value="">Keep band (lean → oily)</option>
            <option value="lean">Lean</option>
            <option value="oily">Oily</option>
          </select>
        </Field>
        <Field htmlFor="assumption-coconut" label="Coconut (grams)">
          <Input
            id="assumption-coconut"
            inputMode="numeric"
            value={coconut}
            onChange={(e) => setCoconut(e.target.value)}
            placeholder={`currently ${payload.assumptions.find((a) => a.key === 'coconut_grams')?.value ?? ''}`}
          />
        </Field>
        <Field htmlFor="assumption-oil" label="Tadka oil (tbsp)">
          <Input
            id="assumption-oil"
            inputMode="numeric"
            value={oil}
            onChange={(e) => setOil(e.target.value)}
            placeholder={`currently ${payload.assumptions.find((a) => a.key === 'oil_tbsp')?.value ?? ''}`}
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => void submit()} disabled={!canSubmit}>
          {saving ? 'Saving...' : 'Recompute band'}
        </Button>
        {queued && !error && (
          <span className="text-small text-muted" aria-live="polite">
            Recompute queued — the band updates in a moment.
          </span>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="error" title="Could not recompute the band">
            {error}
          </Alert>
        </div>
      )}
    </div>
  );
}

function IncompleteView({ label }: { label: string }) {
  return (
    <Alert tone="info" title={`${label} is incomplete`}>
      This view did not pass validation and was never published. Nothing was invented to fill
      it.
    </Alert>
  );
}

function UnavailableView({ label }: { label: string }) {
  return (
    <Alert tone="info" title={`${label} is not available yet`}>
      This analysis run has no content for this view.
    </Alert>
  );
}
