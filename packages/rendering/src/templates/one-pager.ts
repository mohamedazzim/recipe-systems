// D-31 E6 + I5 — the home-mode one-pager print template (Recipe_Systems §12,
// USER_STORIES E6/I5). Renders from PERSISTED analysis snapshots ONLY:
//   keep          = View 2 taste pillars (load-bearing)
//   negotiate     = View 4 substitutions (flexible swaps)
//   identity-shift= View 5 not_this neighbours (what would change the dish)
//   ingredients   = the D-20 station-card mise (persisted ingredient snapshot)
//   energy band   = the View 9 band (I5) — optional, never a nutrition label
// Read-only (INV-12 / ADR §7) — never regenerates analysis content at print time.

import { escapeHtml, pageShell } from './shared';

/** I6 verbatim — the one-pager's band carries it (never a legal nutrition label). */
export const I6_DISCLAIMER =
  'Table estimate from stated assumptions. Not a lab analysis. Not medical advice.';

export interface OnePagerPrintData {
  recipeTitle: string;
  family: string | null;
  keep: Array<{ pillar: string; ifMissing: string; tag: string }>;
  negotiate: Array<{ substitute: string; consequence: string }>;
  identityShift: Array<{ variant: string; keyDifference: string }>;
  ingredients: Array<{ displayName: string; amount: string | null }>;
  /** I5 — the whole-pot View 9 band, optional (absent → the section is omitted). */
  energyBand: { min: number; max: number } | null;
}

export function onePagerHtml(data: OnePagerPrintData): string {
  const keep = data.keep
    .map(
      (p) =>
        `<li class="row"><span class="name"><strong>${escapeHtml(p.pillar)}</strong> — ${escapeHtml(
          p.ifMissing,
        )}</span><span class="tag">${escapeHtml(p.tag)}</span></li>`,
    )
    .join('\n');

  const negotiate = data.negotiate
    .map(
      (s) =>
        `<li class="row"><span class="name">${escapeHtml(s.substitute)} <span class="small">— ${escapeHtml(
          s.consequence,
        )}</span></span><span class="tag">INFERRED</span></li>`,
    )
    .join('\n');

  const identityShift = data.identityShift
    .map(
      (n) =>
        `<li class="row"><span class="name"><strong>${escapeHtml(n.variant)}</strong> — ${escapeHtml(
          n.keyDifference,
        )}</span></li>`,
    )
    .join('\n');

  const ingredients = data.ingredients
    .map(
      (i) =>
        `<li class="row"><span class="name">${escapeHtml(i.displayName)}</span><span class="qty">${
          i.amount ? escapeHtml(i.amount) : ''
        }</span></li>`,
    )
    .join('\n');

  const band =
    data.energyBand !== null
      ? `<h2>Energy (whole pot)</h2>
<p>${data.energyBand.min}–${data.energyBand.max} kcal — a band, never a point.</p>
<p class="small">Not a nutrition label. ${escapeHtml(I6_DISCLAIMER)}</p>`
      : '';

  const body = `<h1>${escapeHtml(data.recipeTitle)}</h1>
<p class="meta">Home mode · one-pager${data.family ? ` · ${escapeHtml(data.family)}` : ''}</p>
${data.keep.length > 0 ? `<h2>Keep</h2>\n<ul>${keep}</ul>` : ''}
${data.negotiate.length > 0 ? `<h2>Negotiate</h2>\n<ul>${negotiate}</ul>` : ''}
${data.identityShift.length > 0 ? `<h2>Identity-shift</h2>\n<ul>${identityShift}</ul>` : ''}
${data.ingredients.length > 0 ? `<h2>Ingredients</h2>\n<ul>${ingredients}</ul>` : ''}
${band}
<p class="footer">Snapshot-only print: this one-pager was frozen from the saved analysis. It is not a nutrition label.</p>`;

  return pageShell(`One-pager — ${data.recipeTitle}`, body);
}
