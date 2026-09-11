// D-23 E4 — the shopping-list print template (Recipe_Systems §12, USER_STORIES
// E4). Renders the PERSISTED D-30 snapshot only: one row per item, canonical
// group order, distinct rows never collapsed (each shopping_key is its own
// row), have/need as a strike (E2 AC-2), qualifiers verbatim, black text, no
// account chrome. The allergen line is the SNAPSHOT value (Q2 Option A) —
// never re-derived at print time.

import { allergenBlock, escapeHtml, pageShell } from './shared';

export interface ShoppingListPrintItem {
  displayName: string;
  displayQuantity: string;
  state: 'have' | 'need';
}

export interface ShoppingListPrintGroup {
  name: string;
  items: ShoppingListPrintItem[];
}

export interface ShoppingListPrintData {
  recipeTitle: string;
  generatedDate: string;
  allergenLine: string | null;
  groups: ShoppingListPrintGroup[];
}

export function shoppingListHtml(data: ShoppingListPrintData): string {
  const groups = data.groups
    .map((group) => {
      const rows = group.items
        .map((item) => {
          const label = item.displayQuantity
            ? `${escapeHtml(item.displayName)} — ${escapeHtml(item.displayQuantity)}`
            : escapeHtml(item.displayName);
          const have = item.state === 'have';
          const rowClass = have ? 'row have' : 'row';
          const checkbox = have ? '☑' : '☐';
          return `<li class="${rowClass}"><span class="checkbox">${checkbox}</span><span class="name">${label}</span></li>`;
        })
        .join('\n');
      return `<h2>${escapeHtml(group.name)}</h2>\n<ul>\n${rows}\n</ul>`;
    })
    .join('\n');

  const body = `<h1>${escapeHtml(data.recipeTitle)}</h1>
<p class="meta">Shopping list — ${escapeHtml(data.generatedDate)}</p>
${groups}
${allergenBlock(data.allergenLine)}
<p class="footer">Snapshot-only print: this list was frozen when generated. Have/need state shown as struck-through rows.</p>`;

  return pageShell(`Shopping list — ${data.recipeTitle}`, body);
}
