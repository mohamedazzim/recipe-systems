import { render, screen } from '@testing-library/react';
import { TomatoProgress } from '@/components/ui/TomatoProgress';

describe('TomatoProgress', () => {
  it('renders an indeterminate sweep with an accessible label and no fake percentage', () => {
    render(<TomatoProgress label="Reading the recipe card" />);
    const bar = screen.getByRole('progressbar', { name: 'Reading the recipe card' });
    expect(bar).toBeInTheDocument();
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('renders a determinate value with the real percentage', () => {
    render(<TomatoProgress label="Uploading" value={42} />);
    const bar = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('clamps an out-of-range value into 0–100', () => {
    render(<TomatoProgress label="Clamped" value={140} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
