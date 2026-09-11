// Rendering package — ADR §7, Tech Stack §12, D-23 (P5-2).
// Strictly read-only (INV-12, QG2 render gate): renders from persisted
// historical snapshots only, never from mutable live recipe rows. The two
// canonical templates (shopping list E4, chef station card E5) and the
// Playwright/Chromium PDF engine live here; the browser print preview uses
// the SAME templates (SCAFFOLD §4).
export const RENDER_RULE = 'snapshot-only (ADR §7; INV-12)';

export { renderAllergenLine } from './allergen-line';
export {
  A4_HEIGHT_PX,
  A4_WIDTH_PX,
  H6_DISCLAIMER,
  allergenBlock,
  escapeHtml,
  pageShell,
} from './templates/shared';
export {
  shoppingListHtml,
  type ShoppingListPrintData,
  type ShoppingListPrintGroup,
  type ShoppingListPrintItem,
} from './templates/shopping-list';
export {
  stationCardHtml,
  type StationCardPrintData,
} from './templates/station-card';
export {
  PdfRenderError,
  chromiumRuntime,
  renderPdf,
  type PdfRuntime,
  type RenderPdfOptions,
} from './pdf';
