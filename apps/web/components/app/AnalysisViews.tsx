'use client';

// D-18 (P3-4): the real analysis result — identification + Views 1–4 in home
// mode, rendered from the persisted analysis_view payloads. Claim tags are
// visible (C4); the View 2 blind spot is shown as required output, never
// "fixed". No content is invented: absent/unavailable views show honest
// empty states.

import { useState } from 'react';
import { Badge, Tag } from '@/components/ui/Badge';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Alert } from '@/components/ui/Alert';
import {
  displayDuration,
  identificationFrom,
  resolveIngredientName,
  view1Payload,
  view2Payload,
  view3Payload,
  view4Payload,
  view5Payload,
} from '@/lib/views';
import type { AnalysisState, MethodState, WireLine } from '@/lib/types';

export interface AnalysisViewsProps {
  analysis: AnalysisState;
  /** Current draft lines for ingredient-name resolution (the persisted name source). */
  lines: WireLine[];
  /** D-13 method wire state for the inferred-source display (fallback: tag only). */
  methodState: MethodState | null;
}

export function AnalysisViews({ analysis, lines, methodState }: AnalysisViewsProps) {
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
  ];

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
