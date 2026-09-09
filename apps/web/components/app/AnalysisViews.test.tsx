import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisViews } from '@/components/app/AnalysisViews';
import type { AnalysisState, WireLine } from '@/lib/types';

const LINES: WireLine[] = [
  {
    id: 'line-fish', line_no: 1, display_name: 'Fish 500g', amount: '500g', unit: null,
    quantity: 500, category: null, confirmed_sense: null, include_on_list: true,
    is_header: false, needs_review: false, ocr_confidence: null, source_tag: 'CARD',
    updated_at: 'x',
  },
  {
    id: 'line-fen1', line_no: 2, display_name: 'Fenugreek powder ½ tsp', amount: '½ tsp',
    unit: null, quantity: null, category: null, confirmed_sense: null,
    include_on_list: true, is_header: false, needs_review: false, ocr_confidence: null,
    source_tag: 'CARD', updated_at: 'x',
  },
];

function analysis(views: AnalysisState['views']): AnalysisState {
  return {
    analysis_id: 'a-1', status: 'complete', mode: 'home', is_latest: true,
    prompt_version: 'v2', model_version: 'stub-no-provider-q9', views,
  };
}

function view(n: number, status: 'COMPLETE' | 'INCOMPLETE', payload: unknown) {
  return { view_number: n, view_key: `view_${n}`, status, payload };
}

describe('AnalysisViews (D-18 home mode, persisted payloads only)', () => {
  it('renders the identification from the persisted view_5 payload (C1)', () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(5, 'COMPLETE', {
            family: 'Coastal Tamil meen kuzhambu',
            architecture: 'Raw-ground coconut paste, triple sour',
            confidence: 'high',
            not_this: [{ variant: 'Kerala kudampuli meen curry', key_difference: 'kudampuli replaces tamarind' }],
            needs_review: true,
            tag: 'INFERRED',
          }),
        ])}
        lines={LINES}
        methodState={{ method_tag: 'INFERRED', method_source: 'CDK 1669 / Mrs. Anitha', list_only: false }}
      />,
    );
    expect(screen.getByText('Coastal Tamil meen kuzhambu')).toBeInTheDocument();
    expect(screen.getByText('Raw-ground coconut paste, triple sour')).toBeInTheDocument();
    expect(screen.getByText('Kerala kudampuli meen curry')).toBeInTheDocument();
    expect(screen.getByText(/kudampuli replaces tamarind/)).toBeInTheDocument();
    expect(screen.getByText('Inferred from CDK 1669 / Mrs. Anitha')).toBeInTheDocument();
  });

  it('View 1: ingredient jobs + omission consequences + role groups, names resolved from lines', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(1, 'COMPLETE', {
            items: [
              { ingredient_id: 'line-fish', job: 'Protein, fat', if_omitted: 'Not this dish', tag: 'CARD' },
            ],
            role_groups: [{ role: 'Body / richness', ingredient_ids: ['line-fish'] }],
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: '1 · Why it works' }));
    expect(screen.getAllByText('Fish 500g').length).toBeGreaterThan(0);
    expect(screen.getByText(/Protein, fat. Without it: Not this dish/)).toBeInTheDocument();
    expect(screen.getByText('Body / richness:')).toBeInTheDocument();
    expect(screen.getAllByText('Fish 500g').length).toBeGreaterThan(1);
  });

  it('View 2: pillars + the blind-spot note is visible (required output, not a bug)', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(2, 'COMPLETE', {
            pillars: [
              { pillar: 'Bitter', source_ingredient_ids: ['line-fen1'], if_missing: 'Generic stew', tag: 'CARD' },
            ],
            blind_spot_notes: [
              { ingredient_id: 'line-fen1', note: 'View 2 under-reports bridge spices.' },
            ],
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: '2 · Balance' }));
    expect(screen.getByText('Bitter')).toBeInTheDocument();
    expect(screen.getByText('Blind spot of this method')).toBeInTheDocument();
    expect(screen.getByText(/under-reports bridge spices/)).toBeInTheDocument();
  });

  it('View 3: narrative walkthrough; UNKNOWN duration stays blank (home-mode required blanks)', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(3, 'COMPLETE', {
            status: 'COMPLETE',
            stages: [
              { stage_name: 'Stage 1', action: 'Build the liquid.', cue: 'Seasoned before fish', duration: 'UNKNOWN', tag: 'INFERRED' },
              { stage_name: 'Stage 2', action: 'Load, then heat.', cue: 'Fish just flaking', duration: '5–6 minutes', tag: 'INFERRED' },
            ],
            incomplete_reason: null,
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: '3 · Process' }));
    expect(screen.getByText('Build the liquid.')).toBeInTheDocument();
    expect(screen.getByText(/About 5–6 minutes\./)).toBeInTheDocument();
    // UNKNOWN duration renders nothing about duration
    expect(screen.queryByText(/About UNKNOWN/)).not.toBeInTheDocument();
  });

  it('View 3 INCOMPLETE shows the persisted reason, never invented content', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(3, 'INCOMPLETE', {
            status: 'INCOMPLETE', stages: [], incomplete_reason: 'No method on the card.',
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: '3 · Process' }));
    expect(screen.getByText('No method on the card.')).toBeInTheDocument();
  });

  it('View 4: substitutions with the canonical consequence + INFERRED tag', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(4, 'COMPLETE', {
            substitutions: [
              { ingredient_id: 'line-fish', substitute: 'Brinjal', consequence: 'Vegetarian version; fish texture lost', tag: 'INFERRED' },
            ],
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: '4 · Substitutions' }));
    expect(screen.getByText('Fish 500g → Brinjal')).toBeInTheDocument();
    expect(screen.getByText('Vegetarian version; fish texture lost')).toBeInTheDocument();
  });

  it('unavailable view: honest empty state, never fake content', async () => {
    render(<AnalysisViews analysis={analysis([])} lines={LINES} methodState={null} />);
    await userEvent.click(screen.getByRole('tab', { name: '1 · Why it works' }));
    expect(screen.getByText('View 1: Why each ingredient exists is not available yet')).toBeInTheDocument();
  });

  it('grounding-failed view (INCOMPLETE, empty payload): refused, never current, never content', async () => {
    render(
      <AnalysisViews
        analysis={analysis([view(1, 'INCOMPLETE', {})])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: '1 · Why it works' }));
    expect(screen.getByText('View 1 is incomplete')).toBeInTheDocument();
    expect(screen.getByText(/never published/)).toBeInTheDocument();
  });

  it('unresolved ingredient ids stay visible, never dropped', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(1, 'COMPLETE', {
            items: [{ ingredient_id: 'gone-line', job: 'Was part of the paste', if_omitted: 'Unclear', tag: 'ASSUMED' }],
            role_groups: [],
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('tab', { name: '1 · Why it works' }));
    expect(screen.getByText('Ingredient gone-lin')).toBeInTheDocument();
  });
});
