// D-23: shared print page shell — one A4 page, black text, no account chrome
// (E4 AC-1/3). The SAME CSS serves both templates and the browser preview
// (SCAFFOLD §4: the preview uses the same templates).

/** H6 — verbatim on every allergen-bearing print surface (D-21). */
export const H6_DISCLAIMER =
  'Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.';

export const A4_WIDTH_PX = 794; // 210mm @ 96dpi
export const A4_HEIGHT_PX = 1123; // 297mm @ 96dpi

const SHELL_CSS = `
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  color: #000;
  font-size: 10.5pt;
  line-height: 1.35;
  max-width: 100%;
}
h1 { font-size: 14pt; margin: 0 0 2pt 0; }
.meta { font-size: 9pt; color: #000; margin: 0 0 8pt 0; }
h2 {
  font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em;
  margin: 8pt 0 2pt 0; border-bottom: 0.6pt solid #000; padding-bottom: 1pt;
}
ul { list-style: none; margin: 0; padding: 0; }
li.row {
  display: flex; align-items: baseline; gap: 4pt;
  padding: 1pt 0; border-bottom: 0.25pt solid #ccc;
}
li.row:last-child { border-bottom: none; }
.checkbox { width: 9pt; flex: none; }
.name { flex: 1 1 auto; }
.qty { flex: none; white-space: nowrap; }
.have { text-decoration: line-through; color: #333; }
.small { font-size: 8.5pt; color: #000; }
.allergen {
  margin-top: 10pt; border-top: 0.8pt solid #000; padding-top: 4pt;
  font-size: 9pt;
}
.footer {
  margin-top: 8pt; border-top: 0.6pt solid #000; padding-top: 3pt;
  font-size: 8.5pt;
}
.tag { font-size: 7.5pt; letter-spacing: 0.05em; }
`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The canonical one-page HTML shell used by BOTH print templates. */
export function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${SHELL_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** The allergen block (frozen snapshot value + H6, verbatim) — omitted
 *  entirely when no line was persisted (nothing is invented, INV-13). */
export function allergenBlock(allergenLine: string | null): string {
  if (!allergenLine) return '';
  return `<div class="allergen">
<strong>Allergen line:</strong> ${escapeHtml(allergenLine)}
<p class="small" style="margin-top:2pt">${escapeHtml(H6_DISCLAIMER)}</p>
</div>`;
}
