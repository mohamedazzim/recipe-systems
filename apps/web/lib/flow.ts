// Client-side session store: recipes created in THIS browser session, kept so
// the Recipe Home can show "recent" recipes. There is no recipe-list endpoint
// in the current backend, so this list is explicitly labeled "This session"
// and holds only recipes created here. Never presented as server data.
//
// Ownership: every recipe is owned by exactly one identity (account XOR guest,
// INV-17). The store tags each record with its owner so the UI never offers a
// recipe to the wrong identity (the backend correctly 404s foreign recipes).

import type { SessionRecipe, WireLine } from '@/lib/types';

const KEY = 'rs.session.recipes';

export type RecipeOwner =
  | { kind: 'user'; accountId: string }
  | { kind: 'guest' };

function readAll(): SessionRecipe[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is SessionRecipe =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as SessionRecipe).recipe_id === 'string' &&
        typeof (r as SessionRecipe).preview === 'string',
    );
  } catch {
    return [];
  }
}

function writeAll(recipes: SessionRecipe[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(recipes.slice(0, 12)));
  } catch {
    // storage unavailable (private mode): the store is best-effort only
  }
}

export function listSessionRecipes(): SessionRecipe[] {
  return readAll();
}

export function recordSessionRecipe(
  recipeId: string,
  preview: string,
  owner: RecipeOwner,
  lines?: WireLine[] | null,
): void {
  const recipes = readAll();
  const existing = recipes.findIndex((r) => r.recipe_id === recipeId);
  const record: SessionRecipe = {
    recipe_id: recipeId,
    created_at: new Date().toISOString(),
    preview: preview.length > 160 ? `${preview.slice(0, 160)}...` : preview,
    owner: owner.kind === 'guest' ? 'guest' : `user:${owner.accountId}`,
    // QA-B1 fix: guests can't fetch lines back from the API (review routes are
    // Bearer-only, API §3) — the parse response is the ONLY copy they'll ever
    // see again, so it is kept here for read-only reopens. Signed-in users
    // always fetch fresh lines and store nothing.
    lines: owner.kind === 'guest' && Array.isArray(lines) ? lines.slice(0, 60) : undefined,
  };
  if (existing >= 0) {
    recipes.splice(existing, 1);
  }
  writeAll([record, ...recipes]);
}

/** Parsed lines stored for a guest-created recipe (null when absent/not guest). */
export function sessionRecipeLines(recipeId: string): WireLine[] | null {
  const record = readAll().find((r) => r.recipe_id === recipeId);
  return record && Array.isArray(record.lines) ? record.lines : null;
}

/** QA-B2 fix: after a server-side claim (the `claimed=1` callback marker), every
 *  guest-tagged record in this browser belongs to the just-signed-in account —
 *  re-tag them so the UI moves them from "Other sessions" to "This session". */
export function claimSessionRecords(accountId: string): number {
  const recipes = readAll();
  let moved = 0;
  const updated = recipes.map((r) => {
    if (r.owner === 'guest') {
      moved += 1;
      return { ...r, owner: `user:${accountId}` as const };
    }
    return r;
  });
  if (moved > 0) {
    writeAll(updated);
  }
  return moved;
}

/** Owner tag of the given record (legacy records without a tag = unknown). */
export function ownerOf(recipe: SessionRecipe): string | null {
  return recipe.owner ?? null;
}

/** Does this record belong to the given identity? Unknown-owner records are
 *  conservatively treated as foreign (never offered across identities). */
export function isOwnedBy(recipe: SessionRecipe, owner: RecipeOwner): boolean {
  const tag = recipe.owner;
  if (tag === undefined || tag === null) return false;
  return owner.kind === 'guest' ? tag === 'guest' : tag === `user:${owner.accountId}`;
}

/** One-line digest of the pasted text for the home list. */
export function previewOf(text: string): string {
  const first = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)[0];
  return first ?? 'Untitled paste';
}
