// D-23 E5 — the station-card print template (Recipe_Systems §12, USER_STORIES
// E5). Renders the PERSISTED D-20 card snapshot only: mise, sequence, control
// points, do-nots, product/yield/hold, provenance tags, chef-mode wording and
// the frozen allergen line (Q2 Option A). Read-only — never regenerates
// analysis content at print time.
// D-26 F4: the next-time line rides the LATEST cook_log.next_time_instruction
// (ADR §7 amendment 2026-09-15 — permitted station-card print source) and is
// tagged COOK LOG, never CARD.

import { allergenBlock, escapeHtml, pageShell } from './shared';

export interface StationCardPrintData {
  recipeTitle: string;
  family: string | null;
  mise: Array<{ displayName: string; amount: string | null; tag: string }>;
  sequence: Array<{
    stageName: string;
    action: string;
    cue: string;
    duration: string;
    tag: string;
  }>;
  controlPoints: Array<{ stageName: string; cue: string; tag: string }>;
  doNots: Array<{ item: string; note: string }>;
  productYieldHold: string | null;
  allergenLine: string | null;
  /** F4 (D-26): the latest cook-log next-time line — tagged COOK LOG. */
  nextTimeLine: string | null;
}

export function stationCardHtml(data: StationCardPrintData): string {
  const mise = data.mise
    .map(
      (item) =>
        `<li class="row"><span class="name">${escapeHtml(item.displayName)}${
          item.amount ? ` <span class="small">· ${escapeHtml(item.amount)}</span>` : ''
        }</span><span class="tag">${escapeHtml(item.tag)}</span></li>`,
    )
    .join('\n');

  const sequence = data.sequence
    .map((stage, index) => {
      const duration =
        stage.duration && stage.duration !== 'UNKNOWN'
          ? escapeHtml(stage.duration)
          : 'clock unknown — cue leads';
      return `<li class="row" style="display:block">
<span class="name"><strong>${index + 1}. ${escapeHtml(stage.stageName)}</strong> <span class="tag">${escapeHtml(stage.tag)}</span></span>
<div>${escapeHtml(stage.action)}</div>
<div class="small">Cue: ${escapeHtml(stage.cue)} · ${duration}</div>
</li>`;
    })
    .join('\n');

  const controlPoints = data.controlPoints
    .map(
      (point) =>
        `<li class="row"><span class="name"><strong>${escapeHtml(point.stageName)}:</strong> ${escapeHtml(point.cue)}</span><span class="tag">${escapeHtml(point.tag)}</span></li>`,
    )
    .join('\n');

  const doNots = data.doNots
    .map(
      (dont) =>
        `<li class="row"><span class="name"><strong>${escapeHtml(dont.item)}</strong> — ${escapeHtml(dont.note)}</span><span class="tag">ABSENT</span></li>`,
    )
    .join('\n');

  const yieldHold =
    data.productYieldHold !== null
      ? `<h2>Product · yield · hold</h2><p>${escapeHtml(data.productYieldHold)}</p>`
      : '';

  // F4: the cook's own next-time instruction — provenance-tagged COOK LOG.
  const nextTime =
    data.nextTimeLine !== null
      ? `<div class="allergen"><strong>Next time:</strong> ${escapeHtml(data.nextTimeLine)} <span class="tag">COOK LOG</span></div>`
      : '';

  const body = `<h1>${escapeHtml(data.recipeTitle)}</h1>
<p class="meta">Chef mode · station card${
    data.family ? ` · ${escapeHtml(data.family)}` : ''
  }</p>
<h2>Mise</h2>
<ul>${mise}</ul>
<h2>Sequence</h2>
<ul>${sequence}</ul>
${
  data.controlPoints.length > 0
    ? `<h2>Control points</h2>\n<ul>${controlPoints}</ul>`
    : ''
}
${
  data.doNots.length > 0
    ? `<h2>Do not</h2>\n<ul>${doNots}</ul>`
    : ''
}
${yieldHold}
${nextTime}
${allergenBlock(data.allergenLine)}
<p class="footer">Untasted briefing. Season after.<br>
Snapshot-only print: this card was frozen when the analysis completed.</p>`;

  return pageShell(`Station card — ${data.recipeTitle}`, body);
}
