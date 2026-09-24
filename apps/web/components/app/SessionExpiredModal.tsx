'use client';

// RS-US: the ONE re-sign-in prompt.
//
// When the BFF session expires every authed call comes back 401, so the buttons
// on the current view just keep failing. Rather than each component printing a
// raw "Sign in required", the shell shows this once and sign-in resumes on the
// same page — the recipe you were working on is still there.

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { API_BASE_URL } from '@/lib/api';

export interface SessionExpiredModalProps {
  open: boolean;
  /** Let the user stay on the page (the buttons will keep failing, but the
   *  choice is theirs — this is never a forced redirect). */
  onDismiss: () => void;
}

export function SessionExpiredModal({ open, onDismiss }: SessionExpiredModalProps) {
  const signInAgain = (): void => {
    const here =
      typeof window === 'undefined'
        ? '/'
        : window.location.pathname + window.location.search;
    window.location.href = `${API_BASE_URL}/auth/login?redirect_to=${encodeURIComponent(here)}`;
  };

  return (
    <Modal
      open={open}
      title="Your session expired"
      description="Sign in again to carry on — the recipe you were working on is still here."
      onClose={onDismiss}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={signInAgain}>Sign in again</Button>
        <Button variant="outline" onClick={onDismiss}>
          Stay on this page
        </Button>
      </div>
    </Modal>
  );
}
