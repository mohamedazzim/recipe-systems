/**
 * Parser for ingredient amount text into structured numeric quantity and unit.
 * Supports fractions (1/2, 1/4), mixed fractions (1 1/2, 1-1/2), unicode vulgar fractions (½, ¼),
 * ranges (1-2 cups), attached units (500g, 1kg, 1/4tsp), word numbers (half cup, one tbsp),
 * and qualitative / imprecise indicators (to taste, as required).
 */

export interface ParsedAmount {
  amount: number | null;
  unit: string | null;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅐': '1/7',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
  '⅑': '1/9',
  '⅒': '1/10',
};

const WORD_NUMBERS: Record<string, number> = {
  half: 0.5,
  quarter: 0.25,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const UNIT_MAP: Record<string, string> = {
  // Volume
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  tb: 'tbsp',
  tbs: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  tsps: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  ml: 'ml',
  mls: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  fl_oz: 'fl oz',
  'fl oz': 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  pint: 'pint',
  pints: 'pint',
  pt: 'pint',
  quart: 'quart',
  quarts: 'quart',
  qt: 'quart',
  gallon: 'gallon',
  gallons: 'gallon',
  gal: 'gallon',

  // Weight / Mass
  g: 'g',
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kgs: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',

  // Pieces / Culinary counts
  nos: 'nos',
  no: 'nos',
  number: 'nos',
  numbers: 'nos',
  piece: 'piece',
  pieces: 'piece',
  pc: 'piece',
  pcs: 'piece',
  sprig: 'sprig',
  sprigs: 'sprig',
  clove: 'clove',
  cloves: 'clove',
  stalk: 'stalk',
  stalks: 'stalk',
  slice: 'slice',
  slices: 'slice',
  leaf: 'leaf',
  leaves: 'leaf',
  inch: 'inch',
  inches: 'inch',
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash',
  drop: 'drop',
  drops: 'drop',
  bunch: 'bunch',
  bunches: 'bunch',
  handful: 'handful',
  handfuls: 'handful',
  pod: 'pod',
  pods: 'pod',
  fillet: 'fillet',
  fillets: 'fillet',
  can: 'can',
  cans: 'can',
  bottle: 'bottle',
  bottles: 'bottle',
};

const IMPRECISE_PHRASES = [
  'to taste',
  'to-taste',
  'as needed',
  'as required',
  'as desired',
  'optional',
  'half shell',
  'half-shell',
  'lemon size',
  'a lemon size',
  'lemon sized',
  'for tempering',
  'for frying',
  'for garnish',
  'for deep frying',
  'to serve',
  'some',
  'few',
  'a few',
];

function roundToPrecision(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function cleanUnit(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let trimmed = raw.trim().replace(/^[—–\-:,\s]+|[—–\-:,\s]+$/g, '').toLowerCase();
  if (!trimmed || trimmed.length === 0) return null;

  // If the unit has become numbers or punctuation only, ignore
  if (/^[\d\s\-_/.,]+$/.test(trimmed)) return null;

  // Remove "of <something>" suffix e.g. "cup of water" -> "cup"
  trimmed = trimmed.replace(/\s+of\s+.*$/, '').trim();

  // If direct lookup in unit map
  if (UNIT_MAP[trimmed]) {
    return UNIT_MAP[trimmed];
  }

  // Check the first word in case of trailing words (e.g. "cups warm water" -> "cup")
  const firstWord = trimmed.split(/[\s,]+/)[0];
  if (firstWord && UNIT_MAP[firstWord]) {
    return UNIT_MAP[firstWord];
  }

  return trimmed || null;
}

/**
 * Parses free-text amount into numeric quantity and normalized unit.
 * Returns { amount: null, unit: null } for imprecise amounts or null/empty input.
 */
export function parseAmountAndUnit(raw: string | null | undefined): ParsedAmount {
  if (!raw) {
    return { amount: null, unit: null };
  }

  let text = raw.trim();
  if (!text) {
    return { amount: null, unit: null };
  }

  // 1. Normalize unicode vulgar fractions (e.g. "1½" -> "1 1/2", "½" -> "1/2")
  text = text.replace(/(\d)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒])/g, '$1 $2');
  text = text.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]/g, (ch) => UNICODE_FRACTIONS[ch] ?? ch);

  // 2. Strip parenthetical qualifiers: "(warm)", "(grated)", "(heaped)"
  text = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  // 3. Strip trailing commas and prep instructions: ", sliced", ", finely chopped"
  text = text.replace(/,.*$/, '').trim();

  const lower = text.toLowerCase();

  // 4. Imprecise check
  for (const phrase of IMPRECISE_PHRASES) {
    if (lower === phrase || lower.startsWith(phrase)) {
      return { amount: null, unit: null };
    }
  }

  // 5. Check for word numbers at start: "half cup", "two sprigs", "one tbsp"
  const wordMatch = lower.match(/^([a-z]+)\s+(.+)$/);
  if (wordMatch && WORD_NUMBERS[wordMatch[1]] !== undefined) {
    const amount = WORD_NUMBERS[wordMatch[1]];
    const unit = cleanUnit(wordMatch[2]);
    return { amount, unit };
  }

  // 6. Mixed fraction with optional unit: "1 1/2 cups", "1-1/2 cup", "2 1/4 tsp"
  const mixedMatch = text.match(/^(\d+)[\s-]+(\d+)\s*\/\s*(\d+)(?:\s*(.+))?$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    if (den !== 0) {
      const amount = roundToPrecision(whole + num / den);
      const unit = cleanUnit(mixedMatch[4]);
      return { amount, unit };
    }
  }

  // 7. Simple fraction with optional unit: "1/4 tsp", "1/2", "3/4 cup", "1/4tsp"
  const fracMatch = text.match(/^(\d+)\s*\/\s*(\d+)(?:\s*(.+))?$/);
  if (fracMatch) {
    const num = Number(fracMatch[1]);
    const den = Number(fracMatch[2]);
    if (den !== 0) {
      const amount = roundToPrecision(num / den);
      const unit = cleanUnit(fracMatch[3]);
      return { amount, unit };
    }
  }

  // 8. Range: "1 - 2 cups", "1 to 2 cups", "1-2"
  const rangeMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)(?:\s*(.+))?$/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    const amount = roundToPrecision((min + max) / 2);
    const unit = cleanUnit(rangeMatch[3]);
    return { amount, unit };
  }

  // 9. Standard number with space or attached unit: "1 cup", "500g", "1.5 kg", "4 nos", "4"
  const numMatch = text.match(/^(\d+(?:\.\d+)?)(?:\s*(.*))?$/);
  if (numMatch) {
    const amount = roundToPrecision(Number(numMatch[1]));
    const unit = cleanUnit(numMatch[2]);
    return { amount, unit };
  }

  return { amount: null, unit: null };
}

/**
 * Extracts a trailing amount from a display name when the line was not split by OCR.
 * E.g., "Fish — 500g" -> "500g", "Fenugreek Powder - 1/2 Tsp" -> "1/2 Tsp".
 */
export function extractAmountFromDisplayName(displayName: string): string | null {
  const idx = displayName.search(/[—–-]/);
  if (idx === -1) return null;
  const tail = displayName.slice(idx + 1).trim();
  if (tail.length === 0) return null;
  if (!/^(\d|[½¼¾⅓⅔]|to taste|a |an |half|for |one|two|three|four)/i.test(tail)) return null;
  return tail;
}

/**
 * Detects a stated serving/yield count from raw recipe text. Deterministic and
 * source-faithful: it only recognizes explicit wording, never infers a number.
 * Supports "serves 4", "serves: 4 people", "4 servings", "4 portions",
 * "yield 4", and "makes 4". Returns null when the source is silent.
 */
export function extractServings(text: string | null | undefined): number | null {
  if (!text) return null;
  const patterns: RegExp[] = [
    /\bserves?\s*:?\s*(\d{1,2})(?:\s*(?:people|persons))?/i,
    /(\d{1,2})\s*servings?/i,
    /(\d{1,2})\s*portions?/i,
    /\byields?\s*:?\s*(\d{1,2})/i,
    /\bmakes?\s*(\d{1,2})(?:\s*(?:servings|portions))?/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const value = Number(match[1]);
      if (Number.isInteger(value) && value >= 1 && value <= 99) return value;
    }
  }
  return null;
}
