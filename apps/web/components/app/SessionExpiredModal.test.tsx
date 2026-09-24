import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionExpiredModal } from '@/components/app/SessionExpiredModal';

describe('SessionExpiredModal', () => {
  it('renders nothing while closed', () => {
    render(<SessionExpiredModal open={false} onDismiss={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is an announced modal dialog with a re-sign-in action', () => {
    render(<SessionExpiredModal open onDismiss={jest.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Your session expired');
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
  });

  it('lets the user stay on the page (never a forced redirect)', async () => {
    const onDismiss = jest.fn();
    render(<SessionExpiredModal open onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
