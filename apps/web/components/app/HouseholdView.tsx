'use client';

// Household profile — a first-class view for the restriction profile (D-26 H1).
// Signed-in users get the real editor; guests see an honest explanation and the
// sign-up path (the profile endpoints are Bearer-only).

import { ArrowLeft, UserCirclePlus } from '@phosphor-icons/react';
import { Heading, Text } from '@/components/ui/Typography';
import { ProfileEditor } from '@/components/app/ProfileEditor';

export interface HouseholdViewProps {
  signedIn: boolean;
  onBack: () => void;
  onSignUp: () => void;
}

export function HouseholdView({ signedIn, onBack, onSignUp }: HouseholdViewProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-sm text-small font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to home
      </button>

      <div className="mt-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <UserCirclePlus size={22} aria-hidden="true" weight="bold" />
        </span>
        <div>
          <Heading level={1}>Household restriction profile</Heading>
          <Text className="mt-1 text-muted">
            Manage allergens and dietary preferences for better analysis and safer recipes.
          </Text>
        </div>
      </div>

      <div className="mt-6 max-w-2xl rounded-lg border border-border bg-surface p-5 sm:p-6">
        {signedIn ? (
          <>
            <p className="text-small text-muted">
              Optional. A conflicting recipe highlights the conflicts first; unknown stays
              unknown. A profile never deletes recipes.
            </p>
            <div className="mt-4">
              <ProfileEditor />
            </div>
          </>
        ) : (
          <div>
            <p className="text-small text-body">
              Restriction profiles are tied to an account. Create one to set your household&apos;s
              allergens and dietary patterns — the analysis then highlights conflicts first,
              without ever deleting recipes.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={onSignUp}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-small font-semibold text-surface transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                Create account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
