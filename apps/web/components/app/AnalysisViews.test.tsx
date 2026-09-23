import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisViews } from '@/components/app/AnalysisViews';
import type { AnalysisState, StationCard, WireLine } from '@/lib/types';

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
        methodState={{ method_tag: 'INFERRED', method_source: 'CDK 1669 / Mrs. Anitha', method_text: 'Simmer in tamarind water.', list_only: false }}
      />,
    );
    expect(screen.getAllByText('Coastal Tamil meen kuzhambu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Raw-ground coconut paste, triple sour').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kerala kudampuli meen curry').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/kudampuli replaces tamarind/).length).toBeGreaterThan(0);
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
    await userEvent.click(screen.getByRole('button', { name: '1 · Why it works' }));
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
    await userEvent.click(screen.getByRole('button', { name: '2 · Balance' }));
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
    await userEvent.click(screen.getByRole('button', { name: '3 · Process' }));
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
    await userEvent.click(screen.getByRole('button', { name: '3 · Process' }));
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
    await userEvent.click(screen.getByRole('button', { name: '4 · Substitutions' }));
    expect(screen.getByText('Fish 500g → Brinjal')).toBeInTheDocument();
    expect(screen.getByText('Vegetarian version; fish texture lost')).toBeInTheDocument();
  });

  it('D-25A C7: previews one persisted substitution class without modifying content', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ingredient_id: 'line-fish',
        substitute: 'Brinjal',
        classification: 'identity_shift',
        what_is_lost: 'Vegetarian version; fish texture lost',
      }),
    });
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
        recipeId="recipe-1"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '4 · Substitutions' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview shift class' }));
    expect(await screen.findByTestId('substitution-class')).toHaveTextContent('Identity shift');
    // The persisted consequence is shown verbatim — nothing new is generated.
    expect(screen.getByText('Vegetarian version; fish texture lost')).toBeInTheDocument();
    const post = (globalThis.fetch as jest.Mock).mock.calls.find(
      (c) => (c[1] as RequestInit)?.method === 'POST',
    );
    expect(post[0]).toContain('/recipes/recipe-1/substitute-preview');
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({
      ingredient_id: 'line-fish',
    });

    // The same control toggles it back OFF (it used to only ever show).
    await userEvent.click(screen.getByRole('button', { name: 'Hide shift class' }));
    expect(screen.queryByTestId('substitution-class')).not.toBeInTheDocument();
    // Hiding is a pure disclosure — it must not re-hit the API.
    const posts = (globalThis.fetch as jest.Mock).mock.calls.filter(
      (c) => (c[1] as RequestInit)?.method === 'POST',
    );
    expect(posts).toHaveLength(1);
  });

  it('unavailable view: honest empty state, never fake content', async () => {
    render(<AnalysisViews analysis={analysis([])} lines={LINES} methodState={null} />);
    await userEvent.click(screen.getByRole('button', { name: '1 · Why it works' }));
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
    await userEvent.click(screen.getByRole('button', { name: '1 · Why it works' }));
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
    await userEvent.click(screen.getByRole('button', { name: '1 · Why it works' }));
    expect(screen.getByText('Ingredient gone-lin')).toBeInTheDocument();
  });
});

describe('AnalysisViews (D-19 Views 5–9)', () => {
  const H6 = 'Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.';
  const I6 = 'Table estimate from stated assumptions. Not a lab analysis. Not medical advice.';

  it('View 5: regional comparison with the G2 review notice', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(5, 'COMPLETE', {
            family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
            architecture: 'Raw-ground coconut paste, triple sour',
            confidence: 'high',
            not_this: [{ variant: 'Kerala meen curry', key_difference: 'Kudampuli instead of tamarind/mango' }],
            needs_review: true,
            tag: 'INFERRED',
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '5 · Regional' }));
    expect(screen.getAllByText(/Kudampuli instead of tamarind/).length).toBeGreaterThan(0);
    expect(screen.getByText('Regional note pending review')).toBeInTheDocument();
  });

  it('View 6: ratios + unresolvable entries with tags', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(6, 'COMPLETE', {
            ratios: [{ components: 'chilli powder : coriander', ratio: '2 tsp : 1 tsp', structural: true, tag: 'CARD' }],
            unresolvable: [{ components: 'salt : liquid', reason: 'salt quantity is null', tag: 'UNKNOWN' }],
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '6 · Ratios' }));
    expect(screen.getByText('chilli powder : coriander: 2 tsp : 1 tsp')).toBeInTheDocument();
    expect(screen.getByText(/salt : liquid/)).toBeInTheDocument();
  });

  it('View 7: sensory elements; INCOMPLETE when no process exists', async () => {
    const { rerender } = render(
      <AnalysisViews
        analysis={analysis([
          view(7, 'COMPLETE', {
            status: 'COMPLETE',
            memorable_elements: [{ element: 'The finish repeats the main ingredient', grounded_in: 'Process stage finish aroma, per View 3', tag: 'INFERRED' }],
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '7 · Sensory' }));
    expect(screen.getByText('The finish repeats the main ingredient')).toBeInTheDocument();
    rerender(
      <AnalysisViews
        analysis={analysis([view(7, 'INCOMPLETE', { status: 'INCOMPLETE', memorable_elements: [] })])}
        lines={LINES}
        methodState={null}
      />,
    );
    expect(screen.getByText('Sensory notes unavailable')).toBeInTheDocument();
  });

  it('View 8: flags present allergens, never "safe", H6 disclaimer verbatim', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(8, 'COMPLETE', {
            present: ['Fish', 'Mustard', 'Coconut', 'Fenugreek'],
            not_on_card: ['garlic', 'ginger'],
            unknown: [],
            removal_notes: [{ item: 'Mustard', note: 'Removing it changes the tadka; the dish is still a kuzhambu.' }],
            disclaimer: H6,
            allergen_line: { contains: ['Fish', 'Mustard', 'Coconut', 'Fenugreek'], notes: ['Fish species unknown.'], unknown: [] },
          }),
        ])}
        lines={LINES}
        methodState={null}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '8 · Dietary' }));
    expect(screen.getAllByText('Fish, Mustard, Coconut, Fenugreek').length).toBeGreaterThan(0);
    expect(screen.getByText(/Fish species unknown/)).toBeInTheDocument();
    expect(screen.getByText(H6)).toBeInTheDocument();
    expect(screen.getByText('Present')).toBeInTheDocument();
    // INV-13: the word "safe" appears nowhere on the View 8 surface
    expect(screen.queryByText(/safe/i)).not.toBeInTheDocument();
  });

  it('View 9: band + sodium Unknown + assumptions + I6 disclaimer verbatim', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(9, 'COMPLETE', {
            band: {
              energy_kcal_min: 1306,
              energy_kcal_max: 2223,
              protein_g: { min: 100, max: 110 },
              fat_g: { min: 60, max: 80 },
              carb_g: { min: 30, max: 40 },
              fibre_g: { min: 5, max: 8 },
            },
            sodium: 'unknown',
            assumptions: [
              { key: 'fish_class', value: 'lean-to-oily (species unknown)', tag: 'ASSUMED' },
              { key: 'coconut_grams', value: '150–200', tag: 'ASSUMED' },
              { key: 'oil_tbsp', value: '1–2', tag: 'ASSUMED' },
              { key: 'unmapped_ingredient', value: 'Fenugreek Powder — 1/2 Tsp', tag: 'ASSUMED' },
            ],
            per_portion: null,
            tightening_factors: ['Name the fish species', 'Weigh the coconut'],
            disclaimer: I6,
          }),
        ])}
        lines={LINES}
        methodState={null}
        signedIn
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '9 · Nutrition' }));
    expect(screen.getByText('1,306–2,223 kcal')).toBeInTheDocument();
    expect(screen.getByText('Sodium: Unknown')).toBeInTheDocument();
    expect(screen.getByText(I6)).toBeInTheDocument();
    // I7: the unmapped line is listed
    expect(screen.getByText('Fenugreek Powder — 1/2 Tsp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recompute band' })).toBeInTheDocument();
  });

  it('View 9 guest: editors hidden, honest note (Bearer-only RS-US-45)', async () => {
    render(
      <AnalysisViews
        analysis={analysis([
          view(9, 'COMPLETE', {
            band: { energy_kcal_min: 1300, energy_kcal_max: 2200, protein_g: { min: 1, max: 2 }, fat_g: { min: 1, max: 2 }, carb_g: { min: 1, max: 2 }, fibre_g: { min: 1, max: 2 } },
            sodium: 'unknown',
            assumptions: [],
            per_portion: null,
            tightening_factors: [],
            disclaimer: I6,
          }),
        ])}
        lines={LINES}
        methodState={null}
        signedIn={false}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '9 · Nutrition' }));
    expect(screen.queryByRole('button', { name: 'Recompute band' })).not.toBeInTheDocument();
    expect(screen.getByText(/Editing assumptions needs an account/)).toBeInTheDocument();
  });

  it('View 9 recompute: PATCH with the edited assumptions, queued state, no false band', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ analysis_id: 'a-1', status: 'recompute_queued', assumptions: { fish_class: 'lean' } }),
    });
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    render(
      <AnalysisViews
        analysis={analysis([
          view(9, 'COMPLETE', {
            band: { energy_kcal_min: 1300, energy_kcal_max: 2200, protein_g: { min: 1, max: 2 }, fat_g: { min: 1, max: 2 }, carb_g: { min: 1, max: 2 }, fibre_g: { min: 1, max: 2 } },
            sodium: 'unknown',
            assumptions: [{ key: 'fish_class', value: 'lean-to-oily (species unknown)', tag: 'ASSUMED' }],
            per_portion: null,
            tightening_factors: [],
            disclaimer: I6,
          }),
        ])}
        lines={LINES}
        methodState={null}
        signedIn
        onRefresh={onRefresh}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '9 · Nutrition' }));
    await userEvent.selectOptions(screen.getByLabelText('Fish class'), 'lean');
    await userEvent.click(screen.getByRole('button', { name: 'Recompute band' }));
    expect(await screen.findByText(/Recompute queued — the band updates in a moment/)).toBeInTheDocument();
    const patch = (globalThis.fetch as jest.Mock).mock.calls.find(
      (c) => (c[1] as RequestInit).method === 'PATCH',
    );
    expect(patch).toBeDefined();
    expect(patch[0]).toContain('/analysis/a-1/view-9/assumptions');
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({ fish_class: 'lean' });
  });

  it('View 9 recompute failure: the real error is visible', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL', message: 'boom' } }),
    });
    render(
      <AnalysisViews
        analysis={analysis([
          view(9, 'COMPLETE', {
            band: { energy_kcal_min: 1300, energy_kcal_max: 2200, protein_g: { min: 1, max: 2 }, fat_g: { min: 1, max: 2 }, carb_g: { min: 1, max: 2 }, fibre_g: { min: 1, max: 2 } },
            sodium: 'unknown',
            assumptions: [],
            per_portion: null,
            tightening_factors: [],
            disclaimer: I6,
          }),
        ])}
        lines={LINES}
        methodState={null}
        signedIn
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '9 · Nutrition' }));
    await userEvent.type(screen.getByLabelText('Coconut (grams)'), '180');
    await userEvent.click(screen.getByRole('button', { name: 'Recompute band' }));
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});

describe('AnalysisViews (D-20 chef mode · station card leads, §7 headers)', () => {
  const CARD: StationCard = {
    station_card_id: 'sc-1',
    analysis_id: 'a-1',
    mise: { l1: { display_name: 'Fish 500g', amount: '500g', tag: 'CARD' } },
    sequence: [{ stage_name: 'Load', action: 'Boil', cue: 'Opaque', duration: 'UNKNOWN', tag: 'METHOD' }],
    do_nots: [],
    control_points: [{ stage_name: 'Load', cue: 'Opaque', tag: 'METHOD' }],
    product_yield_hold: null,
    printable: true,
  };

  it('chef mode leads with the persisted station card', () => {
    render(
      <AnalysisViews
        analysis={{ ...analysis([]), station_card: CARD }}
        lines={LINES}
        methodState={null}
        mode="chef"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Station card' })).toBeInTheDocument();
    expect(screen.getByText('Untasted briefing. Season after.')).toBeInTheDocument();
  });

  it('chef mode without a card shows the honest refusal surface', () => {
    render(
      <AnalysisViews analysis={{ ...analysis([]), station_card: null }} lines={LINES} methodState={null} mode="chef" />,
    );
    expect(screen.getByText(/No station card for this analysis/)).toBeInTheDocument();
  });

  it('chef tabs carry the §7 chef-voice labels; home tabs keep the home labels', () => {
    const a = analysis([]);
    const { rerender } = render(<AnalysisViews analysis={a} lines={LINES} methodState={null} mode="home" />);
    expect(screen.getByRole('button', { name: '3 · Process' })).toBeInTheDocument();
    rerender(<AnalysisViews analysis={a} lines={LINES} methodState={null} mode="chef" />);
    expect(screen.getByRole('button', { name: '3 · Sequence, heat, cue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '8 · Allergen brief' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9 · Assumption log' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '3 · Process' })).not.toBeInTheDocument();
  });
});

describe('AnalysisViews (D-31 home-mode one-pager print)', () => {
  it('with a recipeId in home mode, the one-pager print button opens the snapshot PDF', async () => {
    const viewer = { location: { href: '' }, close: jest.fn() };
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => viewer as never);
    URL.createObjectURL = (jest.fn(() => 'blob:one-pager') as unknown as typeof URL.createObjectURL);
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['%PDF']),
    });
    render(
      <AnalysisViews analysis={analysis([])} lines={LINES} methodState={null} recipeId="recipe-1" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Print one-pager' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('', '_blank'));
    await waitFor(() => expect(viewer.location.href).toBe('blob:one-pager'));
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain(
      '/recipes/recipe-1/print/one-pager',
    );
    openSpy.mockRestore();
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
  });

  it('without a recipeId the one-pager print surface is absent', () => {
    render(<AnalysisViews analysis={analysis([])} lines={LINES} methodState={null} />);
    expect(screen.queryByRole('button', { name: 'Print one-pager' })).not.toBeInTheDocument();
  });

  it('chef mode hides the home one-pager button', () => {
    render(
      <AnalysisViews
        analysis={analysis([])}
        lines={LINES}
        methodState={null}
        mode="chef"
        recipeId="recipe-1"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Print one-pager' })).not.toBeInTheDocument();
  });
});
