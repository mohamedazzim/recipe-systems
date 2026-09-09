// Client-side session store: recipes created in THIS browser session, kept so
// the Recipe Home can show "recent" recipes. There is no recipe-list endpoint
// in the current backend, so this list is explicitly labeled "This session"
// and holds only recipes created here. Never presented as server data.

import type { SessionRecipe } from '@/lib/types';

const KEY = 'rs.session.recipes';

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

export function recordSessionRecipe(recipeId: string, preview: string): void {
  const recipes = readAll();
  const existing = recipes.findIndex((r) => r.recipe_id === recipeId);
  const record: SessionRecipe = {
    recipe_id: recipeId,
    created_at: new Date().toISOString(),
    preview: preview.length > 160 ? `${preview.slice(0, 160)}...` : preview,
  };
  if (existing >= 0) {
    recipes.splice(existing, 1);
  }
  writeAll([record, ...recipes]);
}

/** One-line digest of the pasted text for the home list. */
export function previewOf(text: string): string {
  const first = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)[0];
  return first ?? 'Untitled paste';
}
