import { render, screen } from '@testing-library/react';
import { NoStationCard, StationCard } from '@/components/app/StationCard';
import type { StationCard as StationCardType } from '@/lib/types';

const CARD: StationCardType = {
  station_card_id: 'sc-1',
  analysis_id: 'a-1',
  mise: {
    fish_500g: { display_name: 'Fish — 500g', amount: '500g', tag: 'CARD' },
    tamarind: { display_name: 'Tamarind — A Lemon Size', amount: 'A Lemon Size', tag: 'CARD' },
  },
  sequence: [
    {
      stage_name: 'Load and heat',
      action: 'Add fish, drumstick, chilli; cover; boil then reduce to medium',
      cue: 'Fish opaque and just flaking',
      duration: 'About 5-6 minutes after boil',
      tag: 'METHOD',
    },
    {
      stage_name: 'Finish aroma',
      action: 'Mustard, fenugreek seed, curry leaf and coconut oil tempered last',
      cue: 'Mustard pops; curry leaf crackles',
      duration: 'UNKNOWN',
      tag: 'METHOD',
    },
  ],
  do_nots: [{ item: 'garlic', tag: 'ABSENT', note: 'Confirmed absent at review — do not add.' }],
  control_points: [{ stage_name: 'Load and heat', cue: 'Fish opaque and just flaking', tag: 'METHOD' }],
  product_yield_hold: null,
  printable: true,
};

describe('StationCard (D-20 P4-2)', () => {
  it('renders mise, sequence, control points, do-nots and the untasted line', () => {
    render(<StationCard card={CARD} />);
    expect(screen.getByRole('heading', { name: 'Station card' })).toBeInTheDocument();
    expect(screen.getByText('Fish — 500g')).toBeInTheDocument();
    expect(screen.getAllByText(/A Lemon Size/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1\. Load and heat/)).toBeInTheDocument();
    expect(screen.getAllByText(/Fish opaque and just flaking/).length).toBeGreaterThan(0);
    expect(screen.getByText('garlic')).toBeInTheDocument();
    expect(screen.getByText('Untasted briefing. Season after.')).toBeInTheDocument();
  });

  it('renders the unknown-duration cue honestly (clock unknown — cue leads)', () => {
    render(<StationCard card={CARD} />);
    expect(screen.getByText(/clock unknown — cue leads/)).toBeInTheDocument();
  });

  it('renders product/yield/hold only when present (unknowns stay blank)', () => {
    render(<StationCard card={CARD} />);
    expect(screen.queryByText(/Product · yield · hold/)).not.toBeInTheDocument();
    render(
      <StationCard
        card={{
          ...CARD,
          product_yield_hold: { Fish: 'Firm, steak-able. Species UNKNOWN', Oil: 'Coconut oil CARD. Volume UNKNOWN' },
        }}
      />,
    );
    expect(screen.getAllByText(/Product · yield · hold/).length).toBeGreaterThan(0);
  });

  it('NoStationCard explains the refusal path honestly (never fabricates a card)', () => {
    render(<NoStationCard />);
    expect(screen.getByText(/No station card for this analysis/)).toBeInTheDocument();
  });
});
