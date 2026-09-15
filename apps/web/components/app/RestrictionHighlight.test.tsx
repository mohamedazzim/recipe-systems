import { render, screen, waitFor } from '@testing-library/react';
import { RestrictionHighlight } from '@/components/app/RestrictionHighlight';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const HIGHLIGHT = {
  conflicts: ['Fish'],
  unknown: ['Peanut'],
  not_flagged: ['Shellfish'],
  profile_notes: ['diet pattern: vegan (no card data to compare — shown as unknown, never a pass)'],
};

describe('RestrictionHighlight (D-26 H3)', () => {
  beforeEach(() => {
    (api as jest.Mock).mockReset();
  });

  it('renders conflicts first, unknown as unknown, and profile notes', async () => {
    (api as jest.Mock).mockResolvedValue(HIGHLIGHT);
    render(<RestrictionHighlight analysisId="a-1" signedIn />);
    expect(await screen.findByTestId('restriction-highlight')).toBeInTheDocument();
    expect(screen.getByText('Conflicts first')).toBeInTheDocument();
    expect(screen.getByText('Fish')).toBeInTheDocument();
    expect(screen.getByText('Unknown — not a pass')).toBeInTheDocument();
    expect(screen.getByText('Peanut')).toBeInTheDocument();
    expect(screen.getByText(/Not flagged on this card/)).toBeInTheDocument();
    expect(screen.getByText(/diet pattern: vegan/)).toBeInTheDocument();
  });

  it('renders nothing for guests and when no profile conflicts exist', async () => {
    render(<RestrictionHighlight analysisId="a-1" signedIn={false} />);
    expect(screen.queryByTestId('restriction-highlight')).not.toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();

    (api as jest.Mock).mockResolvedValue({
      conflicts: [],
      unknown: [],
      not_flagged: [],
      profile_notes: [],
    });
    render(<RestrictionHighlight analysisId="a-1" signedIn />);
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(screen.queryByTestId('restriction-highlight')).not.toBeInTheDocument();
  });
});
