'use client';

// Non-blocking account band for guests. Never the main page: a single
// secondary strip that explains the guest state and offers the claim path.

import { UserCirclePlus, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';

export interface GuestNoticeProps {
  onSignUp: () => void;
  onDismiss: () => void;
}

export function GuestNotice({ onSignUp, onDismiss }: GuestNoticeProps) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-small text-body">
        You are exploring as a guest. Your recipes and analyses can be claimed onto an account
        later.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" onClick={onSignUp}>
          <UserCirclePlus size={16} aria-hidden="true" weight="bold" />
          Create account and claim
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          aria-label="Dismiss the guest notice"
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
