import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Accordion } from '@/components/ui/Accordion';

const items = [
  { id: 'a', label: 'Alpha', description: 'First section', content: <p>Alpha content</p> },
  { id: 'b', label: 'Beta', description: 'Second section', content: <p>Beta content</p> },
  { id: 'c', label: 'Gamma', description: 'Third section', content: <p>Gamma content</p> },
];

describe('Accordion', () => {
  it('opens the default section and keeps the rest collapsed', () => {
    render(<Accordion items={items} defaultOpen="a" />);
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Alpha content')).toBeInTheDocument();
    expect(screen.queryByText('Beta content')).not.toBeInTheDocument();
  });

  it('clicking a header opens it and closes the previously open section (one-at-a-time)', async () => {
    render(<Accordion items={items} defaultOpen="a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Beta content')).toBeInTheDocument();
    expect(screen.queryByText('Alpha content')).not.toBeInTheDocument();
  });

  it('clicking an open header collapses it', async () => {
    render(<Accordion items={items} defaultOpen="a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Alpha content')).not.toBeInTheDocument();
  });

  it('exposes aria-controls pointing at the unique panel id', () => {
    render(<Accordion items={items} defaultOpen="b" />);
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-controls', 'b-panel');
    const panel = document.getElementById('b-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Beta content');
  });

  it('opens sections with the keyboard (Enter and Space)', async () => {
    render(<Accordion items={items} defaultOpen="a" />);
    const gamma = screen.getByRole('button', { name: 'Gamma' });
    gamma.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Gamma' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Gamma content')).toBeInTheDocument();

    await userEvent.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Gamma' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Gamma content')).not.toBeInTheDocument();
  });
});
