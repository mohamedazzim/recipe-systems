// D-23 — rendering package unit tests: the two templates (E4/E5), the shared
// allergen renderer (H4/Q2), and the PDF engine's failure cells (QG4) with an
// injected fake runtime (no browser in unit tests).

import type { View8Payload } from '@recipe-systems/schemas';
import { renderAllergenLine } from './allergen-line';
import { shoppingListHtml, ShoppingListPrintData } from './templates/shopping-list';
import { stationCardHtml, StationCardPrintData } from './templates/station-card';
import { H6_DISCLAIMER } from './templates/shared';
import { PdfRenderError, renderPdf, PdfRuntime } from './pdf';

const VIEW8: View8Payload = {
  present: ['Fish', 'Mustard'],
  not_on_card: [],
  unknown: ['Coconut'],
  removal_notes: [],
  disclaimer: 'Reads the card only. Does not test food.',
  allergen_line: {
    contains: ['Fish', 'Coconut', 'Fenugreek'],
    notes: ['Fish species unknown.'],
    unknown: [],
  },
};

describe('renderAllergenLine (H4 / Q2 Option A)', () => {
  it('joins contains / unknown / notes deterministically', () => {
    expect(renderAllergenLine(VIEW8)).toBe(
      'Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.',
    );
  });
  it('returns null for an empty line (nothing invented)', () => {
    expect(
      renderAllergenLine({ ...VIEW8, allergen_line: { contains: [], notes: [], unknown: [] } }),
    ).toBeNull();
  });
});

const LIST: ShoppingListPrintData = {
  recipeTitle: 'Kanyakumari Meen Kuzhambu',
  generatedDate: '2026-09-11',
  allergenLine: 'Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.',
  groups: [
    {
      name: 'fresh produce',
      items: [
        { displayName: 'Mango — 1/2 Nos', displayQuantity: '', state: 'need' },
        { displayName: 'Tamarind — A Lemon Size', displayQuantity: '', state: 'have' },
      ],
    },
    {
      name: 'spices',
      items: [
        { displayName: 'Fenugreek Powder — 1/2 Tsp', displayQuantity: '', state: 'need' },
        { displayName: 'Fenugreek — 1/4 Tsp', displayQuantity: '', state: 'need' },
      ],
    },
    {
      name: 'fats/oils',
      items: [{ displayName: 'Coconut Oil', displayQuantity: 'For Tempering', state: 'need' }],
    },
  ],
};

describe('shoppingListHtml (E4)', () => {
  it('renders black-text snapshot rows: groups, qualifiers, both fenugreeks distinct, have-strike', () => {
    const html = shoppingListHtml(LIST);
    expect(html).toContain('Kanyakumari Meen Kuzhambu');
    expect(html).toContain('>fresh produce<');
    expect(html).toContain('>spices<');
    expect(html).toContain('>fats/oils<');
    expect(html).toContain('Fenugreek Powder — 1/2 Tsp');
    expect(html).toContain('Fenugreek — 1/4 Tsp'); // distinct rows, never collapsed
    expect(html).toContain('Coconut Oil — For Tempering'); // qualifier verbatim
    const haveRowStart = html.lastIndexOf('<li class="row have"', html.indexOf('Tamarind — A Lemon Size'));
    const haveRow = html.slice(haveRowStart, html.indexOf('</li>', haveRowStart));
    expect(haveRow).toContain('class="row have"'); // E2 AC-2 strike
    expect(haveRow).toContain('>☑</span>');
    expect(html).toContain('>☐</span>');
  });

  it('includes the snapshot allergen line + H6 verbatim; no "safe"; no account chrome', () => {
    const html = shoppingListHtml(LIST);
    expect(html).toContain('Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.');
    expect(html).toContain(H6_DISCLAIMER);
    expect(html).not.toMatch(/\bsafe\b/i);
    expect(html).not.toContain('Sign out');
    expect(html).not.toContain('account');
  });

  it('omits the allergen section entirely when no line was persisted', () => {
    const html = shoppingListHtml({ ...LIST, allergenLine: null });
    expect(html).not.toContain('Allergen line');
    expect(html).not.toContain(H6_DISCLAIMER);
  });

  it('prints the amount ONCE when the display name already carries it', () => {
    // displayName is the verbatim card line and already contains the amount;
    // displayQuantity is that same extracted value. Rendering both printed the
    // quantity twice, on screen and in print ("Fish — 500g — 500g").
    const html = shoppingListHtml({
      ...LIST,
      groups: [
        {
          name: 'fish',
          items: [{ displayName: 'Fish — 500g', displayQuantity: '500g', state: 'need' }],
        },
      ],
    });
    expect(html).toContain('Fish — 500g');
    expect(html).not.toContain('500g — 500g');
  });

  it('still appends a quantity the display name does not carry', () => {
    const html = shoppingListHtml({
      ...LIST,
      groups: [
        {
          name: 'fats/oils',
          items: [
            { displayName: 'Coconut Oil', displayQuantity: 'For Tempering', state: 'need' },
          ],
        },
      ],
    });
    expect(html).toContain('Coconut Oil — For Tempering');
  });

  it('escapes markup in user-controlled text', () => {
    const html = shoppingListHtml({
      ...LIST,
      recipeTitle: '<script>alert("x")</script>',
      groups: [],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

const CARD: StationCardPrintData = {
  recipeTitle: 'Kanyakumari Meen Kuzhambu',
  family: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
  mise: [{ displayName: 'Fish — 500g', amount: '500g', tag: 'CARD' }],
  sequence: [
    {
      stageName: 'Load and heat',
      action: 'Add fish; boil then reduce',
      cue: 'Fish opaque and just flaking',
      duration: 'About 5-6 minutes',
      tag: 'METHOD',
    },
  ],
  controlPoints: [{ stageName: 'Load and heat', cue: 'Fish opaque and just flaking', tag: 'METHOD' }],
  doNots: [{ item: 'garlic', note: 'Confirmed absent at review — do not add.' }],
  productYieldHold: null,
  allergenLine: 'Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.',
  nextTimeLine: null,
};

describe('stationCardHtml (E5)', () => {
  it('mise renders the amount once when the card line already carries it', () => {
    // Same doubling as the shopping list: the captured display_name is verbatim
    // ("Fish — 500g") and `amount` is the same extracted value, so the mise line
    // must not read "Fish — 500g · 500g".
    const html = stationCardHtml(CARD);
    expect(html).toContain('Fish — 500g');
    expect(html).not.toContain('500g · 500g');
  });

  it('renders every persisted section + chef-mode wording + provenance + untasted briefing', () => {
    const html = stationCardHtml(CARD);
    expect(html).toContain('Chef mode · station card');
    expect(html).toContain('Coastal Tamil (Kanyakumari) style meen kuzhambu');
    expect(html).toContain('Mise');
    expect(html).toContain('Fish — 500g');
    expect(html).toContain('Sequence');
    expect(html).toContain('Control points');
    expect(html).toContain('Do not');
    expect(html).toContain('garlic');
    expect(html).toContain('Untasted briefing. Season after.');
    expect(html).toContain('CARD');
    expect(html).toContain('METHOD');
  });

  it('keeps the clock-unknown wording and includes the frozen allergen line + H6', () => {
    const html = stationCardHtml({
      ...CARD,
      sequence: [{ ...CARD.sequence[0], duration: 'UNKNOWN' }],
    });
    expect(html).toContain('clock unknown — cue leads');
    expect(html).toContain('Contains: Fish, Coconut, Fenugreek. Notes: Fish species unknown.');
    expect(html).toContain(H6_DISCLAIMER);
    expect(html).not.toMatch(/\bsafe\b/i);
  });

  it('renders product/yield/hold when present and omits it when null', () => {
    expect(stationCardHtml(CARD)).not.toContain('Product · yield · hold');
    expect(
      stationCardHtml({ ...CARD, productYieldHold: 'Sauce holds overnight; reheat gently' }),
    ).toContain('Product · yield · hold');
  });

  it('omits the allergen section when no line was persisted', () => {
    const html = stationCardHtml({ ...CARD, allergenLine: null });
    expect(html).not.toContain('Allergen line');
    expect(html).not.toContain(H6_DISCLAIMER);
  });

  it('D-26 F4: the next-time line is tagged COOK LOG, never CARD, and omitted when absent', () => {
    expect(stationCardHtml(CARD)).not.toContain('Next time');
    const html = stationCardHtml({
      ...CARD,
      nextTimeLine: '2 green chillies, fenugreek powder off heat',
    });
    expect(html).toContain('Next time:');
    expect(html).toContain('2 green chillies, fenugreek powder off heat');
    expect(html).toContain('COOK LOG');
    // the next-time block never claims a card provenance
    const nextTimeBlock = html.slice(html.indexOf('Next time:'));
    expect(nextTimeBlock).not.toContain('>CARD<');
  });
});

describe('renderPdf (QG4 failure cells)', () => {
  function okRuntime(buffer = Buffer.from('%PDF-1.4 fake')): PdfRuntime {
    return {
      renderToPdf: jest.fn(async () => buffer),
      measureHeight: jest.fn(async () => 800),
    };
  }

  it('returns the rendered buffer on success', async () => {
    const runtime = okRuntime();
    const out = await renderPdf('<html/>', runtime);
    expect(out.toString()).toContain('%PDF');
    expect(runtime.renderToPdf).toHaveBeenCalledTimes(1);
  });

  it('Chromium launch failure → retried (bounded attempts) then PdfRenderError', async () => {
    const runtime: PdfRuntime = {
      renderToPdf: jest.fn(async () => {
        throw new Error('browserType.launch: Executable does not exist');
      }),
      measureHeight: jest.fn(async () => 800),
    };
    await expect(renderPdf('<html/>', runtime, { attempts: 2 })).rejects.toBeInstanceOf(
      PdfRenderError,
    );
    await expect(renderPdf('<html/>', runtime, { attempts: 2 })).rejects.toThrow(
      /after 2 attempt/,
    );
    expect(runtime.renderToPdf).toHaveBeenCalledTimes(4);
  });

  it('transient failure then success → one retry and the buffer', async () => {
    let calls = 0;
    const runtime: PdfRuntime = {
      renderToPdf: jest.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('Protocol error (Target crashed)');
        return Buffer.from('%PDF-1.4 ok');
      }),
      measureHeight: jest.fn(async () => 800),
    };
    const out = await renderPdf('<html/>', runtime, { attempts: 2 });
    expect(out.toString()).toContain('%PDF-1.4 ok');
    expect(calls).toBe(2);
  });

  it('render timeout → PdfRenderError (never a blank/partial PDF)', async () => {
    const runtime: PdfRuntime = {
      renderToPdf: jest.fn(async () => {
        throw new Error('Timeout 30000ms exceeded');
      }),
      measureHeight: jest.fn(async () => 800),
    };
    await expect(renderPdf('<html/>', runtime, { attempts: 1 })).rejects.toBeInstanceOf(
      PdfRenderError,
    );
  });
});
