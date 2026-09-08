// Rendering package — ADR §7, Tech Stack §12.
// Strictly read-only (INV-12, QG2 render gate): renders from persisted historical snapshots only,
// never from mutable live recipe rows. Templates (shopping list, chef station card) arrive with
// the P5 print units (D-23).
export const RENDER_RULE = 'snapshot-only (ADR §7; INV-12)';
