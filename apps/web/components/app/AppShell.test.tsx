import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '@/components/app/AppShell';

describe('AppShell', () => {
  function props(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
    return {
      user: null,
      view: { name: 'home' } as const,
      onNavigate: jest.fn(),
      onSignOut: jest.fn(),
      children: <p>App content</p>,
      ...overrides,
    };
  }

  it('brands the app and shows the guest state', () => {
    render(<AppShell {...props()} />);
    expect(screen.getAllByText('Recipe Systems').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Understand. Cook. Enjoy.')).toBeInTheDocument();
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByText('App content')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Sign out' })).toHaveLength(0);
  });

  it('wordmark navigates home', async () => {
    const p = props();
    render(<AppShell {...p} />);
    const brand = screen.getAllByRole('button', { name: /Recipe Systems/ })[0];
    await userEvent.click(brand);
    expect(p.onNavigate).toHaveBeenCalledWith({ name: 'home' });
  });

  it('signed-in: shows the email and sign out', async () => {
    const p = props({
      user: { id: 'u1', email: 'chef@recipesystems.test', preferred_mode: 'home', label_pack: null },
    });
    render(<AppShell {...p} />);
    expect(screen.getAllByText('chef@recipesystems.test').length).toBeGreaterThanOrEqual(1);
    await userEvent.click(screen.getAllByRole('button', { name: 'Sign out' })[0]);
    expect(p.onSignOut).toHaveBeenCalled();
  });

  it('signed-in: the avatar menu holds profile and sign out', async () => {
    const p = props({
      user: { id: 'u1', email: 'chef@recipesystems.test', preferred_mode: 'home', label_pack: null },
    });
    render(<AppShell {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for chef@recipesystems.test' }));
    const menu = screen.getByLabelText('Account menu');
    expect(within(menu).getByRole('button', { name: /Household profile/ })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('button', { name: /^Sign out$/ }));
    expect(p.onSignOut).toHaveBeenCalled();
  });

  it('top-bar search submits the query to the parent', async () => {
    const p = props({ onSearch: jest.fn() });
    render(<AppShell {...p} />);
    await userEvent.type(screen.getByLabelText('Search your recipes, ingredients or cuisines'), 'tamarind{Enter}');
    expect(p.onSearch).toHaveBeenCalledWith('tamarind');
  });

  it('workspace mode: renders the recipe workspace section links', () => {
    const p = props({
      view: { name: 'workspace', recipeId: 'r1' } as const,
      workspaceSections: { active: 'ingredients', onSelect: jest.fn() },
    });
    render(<AppShell {...p} />);
    expect(screen.getByRole('navigation', { name: 'Recipe workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ingredients' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shopping list' })).toBeInTheDocument();
    // Analysis views + Cook mode were removed from the rail (they live in the workspace).
    expect(screen.queryByRole('button', { name: 'Analysis views' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cook mode' })).not.toBeInTheDocument();
  });

  it('collapses to an icon rail and expands again', async () => {
    const p = props();
    render(<AppShell {...p} />);
    expect(screen.getByText('Good food brings people together.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    // quote + group labels are hidden in the collapsed rail
    expect(screen.queryByText('Good food brings people together.')).not.toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
    // nav stays keyboard-accessible via sr-only labels inside the rail
    expect(
      within(screen.getByRole('complementary', { name: 'Primary' })).getByRole('button', {
        name: 'Library',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByText('Good food brings people together.')).toBeInTheDocument();
  });
});
