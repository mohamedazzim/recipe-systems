import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '@/components/app/AppShell';

describe('AppShell', () => {
  function props(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
    return {
      user: null,
      onNavigate: jest.fn(),
      onSignOut: jest.fn(),
      children: <p>App content</p>,
      ...overrides,
    };
  }

  it('brands the app and shows the guest state', () => {
    render(<AppShell {...props()} />);
    expect(screen.getByText('Recipe Systems')).toBeInTheDocument();
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByText('App content')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('wordmark navigates home', async () => {
    const p = props();
    render(<AppShell {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /Recipe Systems/ }));
    expect(p.onNavigate).toHaveBeenCalledWith({ name: 'home' });
  });

  it('signed-in: shows the email and sign out', async () => {
    const p = props({
      user: { id: 'u1', email: 'chef@recipesystems.test', preferred_mode: 'home', label_pack: null },
    });
    render(<AppShell {...p} />);
    expect(screen.getByText('chef@recipesystems.test')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(p.onSignOut).toHaveBeenCalled();
  });
});
