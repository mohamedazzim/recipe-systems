import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HouseholdView } from '@/components/app/HouseholdView';

describe('HouseholdView', () => {
  function props(overrides: Partial<Parameters<typeof HouseholdView>[0]> = {}) {
    return {
      signedIn: true,
      onBack: jest.fn(),
      onSignUp: jest.fn(),
      ...overrides,
    };
  }

  it('signed-in: renders the heading and the real profile editor', () => {
    render(<HouseholdView {...props()} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Household restriction profile' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/A conflicting recipe highlights the conflicts first/)).toBeInTheDocument();
  });

  it('guest: explains the account requirement and offers sign up', () => {
    const p = props({ signedIn: false });
    render(<HouseholdView {...p} />);
    expect(screen.getByText(/Restriction profiles are tied to an account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('back returns to home', async () => {
    const p = props();
    render(<HouseholdView {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /Back to home/ }));
    expect(p.onBack).toHaveBeenCalled();
  });
});
