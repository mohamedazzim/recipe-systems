import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeView } from '@/components/app/HomeView';
import { recordSessionRecipe } from '@/lib/flow';

describe('HomeView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function props(overrides: Partial<Parameters<typeof HomeView>[0]> = {}) {
    return {
      signedIn: true,
      onCreate: jest.fn(),
      onOpenRecipe: jest.fn(),
      onSignUp: jest.fn(),
      onSignOut: jest.fn(),
      ...overrides,
    };
  }

  it('renders the product heading and the primary create action', () => {
    render(<HomeView {...props()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Your recipes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create recipe' })).toBeInTheDocument();
  });

  it('shows a helpful empty state when no session recipes exist', () => {
    render(<HomeView {...props()} />);
    expect(screen.getByText('No recipes yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paste your first recipe' })).toBeInTheDocument();
  });

  it('lists session recipes and opens them', async () => {
    recordSessionRecipe('r1', 'Meen Kuzhambu');
    const p = props();
    render(<HomeView {...p} />);
    const row = screen.getByRole('button', { name: /Meen Kuzhambu/ });
    expect(row).toBeInTheDocument();
    await userEvent.click(row);
    expect(p.onOpenRecipe).toHaveBeenCalledWith('r1');
  });

  it('guest: shows the secondary claim band, dismissible, never blocking the create action', async () => {
    const p = props({ signedIn: false });
    render(<HomeView {...p} />);
    expect(screen.getByText(/exploring as a guest/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account and claim' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create recipe' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss the guest notice' }));
    expect(screen.queryByText(/exploring as a guest/i)).not.toBeInTheDocument();
  });

  it('signed in: account section offers sign out', async () => {
    const p = props();
    render(<HomeView {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(p.onSignOut).toHaveBeenCalled();
  });
});
