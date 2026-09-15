import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileEditor } from '@/components/app/ProfileEditor';
import { api, ApiError } from '@/lib/api';

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

const VOCAB = {
  allergens: [
    { code: 'fish', name: 'Fish', label_pack: 'both' },
    { code: 'mustard', name: 'Mustard', label_pack: 'eu' },
  ],
  diet_patterns: ['vegetarian', 'vegan', 'gluten-free'],
};

beforeEach(() => {
  (api as jest.Mock).mockReset();
  (api as jest.Mock).mockImplementation(async (path: string) => {
    if (path === '/me/restriction-profile') {
      return { profile_id: null, allergens: [], diet_patterns: [], label_pack: null };
    }
    if (path === '/restriction-vocabulary') return VOCAB;
    throw new Error(`unexpected GET ${path}`);
  });
});

describe('ProfileEditor (D-26 H1)', () => {
  it('renders the canonical vocabulary and an empty optional profile', async () => {
    render(<ProfileEditor />);
    expect(await screen.findByText('Fish')).toBeInTheDocument();
    expect(screen.getByText('Mustard')).toBeInTheDocument();
    expect(screen.getByText('vegetarian')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument();
  });

  it('saves the profile with the canonical PUT body', async () => {
    render(<ProfileEditor />);
    await screen.findByText('Fish');
    await userEvent.click(screen.getByRole('button', { name: 'Fish' }));
    await userEvent.click(screen.getByRole('button', { name: 'vegetarian' }));
    await userEvent.click(screen.getByRole('radio', { name: 'EU' }));
    (api as jest.Mock).mockResolvedValueOnce({
      profile_id: 'p1',
      allergens: ['fish'],
      diet_patterns: ['vegetarian'],
      label_pack: 'EU',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/me/restriction-profile',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            allergens: ['fish'],
            diet_patterns: ['vegetarian'],
            label_pack: 'EU',
          }),
        }),
      );
    });
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
  });

  it('a rejected save surfaces the honest error (strict canonical validation)', async () => {
    render(<ProfileEditor />);
    await screen.findByText('Fish');
    (api as jest.Mock).mockRejectedValueOnce(
      new ApiError(400, 'INVALID_RESTRICTION_PROFILE', 'Unknown allergen code(s): dragonfruit'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText(/Unknown allergen code/)).toBeInTheDocument();
  });
});
