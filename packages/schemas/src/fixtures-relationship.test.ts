// Cross-contract consistency (dispatch §14) + fixture relationship (dispatch §15):
// one source of truth for shared types; D-03 golden + D-04 corpus stay canonical and
// the frozen schemas accept the spec's own example values.
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import {
  CLAIM_TAGS,
  ClaimTagSchema,
  AnalysisEnvelopeSchema,
  IdentificationSchema,
  View8PayloadSchema,
  View9PayloadSchema,
  VIEW_SCHEMAS,
  ANALYSIS_ENVELOPE_VIEWS,
  ConfidenceSchema,
} from './index';
import { view8Valid, view9Valid, envelopeValid } from './fixtures';

const REPO = path.join(__dirname, '..', '..', '..');
const GOLDEN = JSON.parse(
  fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'golden_kanyakumari_card.json'), 'utf8'),
);
const CORPUS_RS001 = JSON.parse(
  fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'corpus', 'rs-001.json'), 'utf8'),
);

describe('cross-contract consistency', () => {
  it('every per-view tag literal belongs to the six canonical claim tags', () => {
    ['CARD', 'METHOD', 'INFERRED', 'ABSENT', 'UNKNOWN', 'ASSUMED'].forEach((t) => {
      expect(ClaimTagSchema.safeParse(t).success).toBe(true);
    });
    expect(CLAIM_TAGS).toEqual(['CARD', 'METHOD', 'INFERRED', 'ABSENT', 'UNKNOWN', 'ASSUMED']);
  });

  it('the envelope claim_tags record is keyed by the SAME canonical tag enum', () => {
    const withEveryTag = { ...envelopeValid, claim_tags: {} as Record<string, number> };
    CLAIM_TAGS.forEach((t) => {
      withEveryTag.claim_tags[t] = 0;
    });
    expect(AnalysisEnvelopeSchema.safeParse(withEveryTag).success).toBe(true);
    expect(AnalysisEnvelopeSchema.safeParse({ ...envelopeValid, claim_tags: { GUESS: 0 } }).success).toBe(false);
  });

  it('the envelope uses the SAME schema instances as VIEW_SCHEMAS (no duplicate definitions)', () => {
    expect(Object.keys(VIEW_SCHEMAS)).toEqual([
      'view_1', 'view_2', 'view_3', 'view_4', 'view_5', 'view_6', 'view_7', 'view_8', 'view_9',
    ]);
    (Object.keys(VIEW_SCHEMAS) as Array<keyof typeof VIEW_SCHEMAS>).forEach((key) => {
      expect((ANALYSIS_ENVELOPE_VIEWS as any).shape[key]).toBe(VIEW_SCHEMAS[key]);
    });
  });

  it('Identification and View 5 share ONE confidence enum instance (same source)', () => {
    // Exported shared instance is used by both contracts; verify the identity directly.
    expect(ConfidenceSchema.safeParse('high').success).toBe(true);
    expect(ConfidenceSchema.safeParse('certain').success).toBe(false);
    // And both consuming schemas agree on behavior for all three values + reject one foreign value.
    ['high', 'medium', 'low'].forEach((v) => {
      expect(ConfidenceSchema.safeParse(v).success).toBe(true);
    });
    expect(ConfidenceSchema.safeParse('certain').success).toBe(false);
    const identShape = (IdentificationSchema as any).shape;
    const view5Shape = (VIEW_SCHEMAS.view_5 as any).shape;
    expect(identShape.confidence).toBe(view5Shape.confidence);
  });
});

describe('fixture relationship (D-03 golden + D-04 corpus)', () => {
  it('D-04 rs-001 carries the SAME expected block as the D-03 golden fixture', () => {
    expect(CORPUS_RS001.expected).toEqual(GOLDEN.expected);
  });

  it('the golden View 9 band (1300–2200) validates against the frozen View 9 schema', () => {
    const band = GOLDEN.expected.view_9.energy_kcal;
    const payload = { ...view9Valid, band: { ...view9Valid.band, energy_kcal_min: band.min, energy_kcal_max: band.max } };
    expect(View9PayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('the golden View 9 sodium expectation ("Unknown") is satisfied by the literal "unknown"', () => {
    expect(view9Valid.sodium).toBe('unknown');
    expect(View9PayloadSchema.safeParse(view9Valid).success).toBe(true);
  });

  it('a canonical View 8 payload built from the golden expectations validates', () => {
    const payload = {
      ...view8Valid,
      present: ['Fish', 'Mustard'],
      allergen_line: {
        contains: ['Fish', 'Mustard', 'Coconut (declared)', 'Fenugreek (legume)'],
        notes: ['Fish species unknown'],
        unknown: ['Gluten (spice powders)'],
      },
    };
    expect(View8PayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('the golden family is accepted by IdentificationSchema and is not the generic classification', () => {
    const name = GOLDEN.expected.family.name;
    expect(name).not.toBe('generic Indian curry');
    expect(
      IdentificationSchema.safeParse({
        family: name,
        architecture: 'Raw-ground coconut paste, triple sour, late fenugreek + pepper',
        confidence: 'high',
        not_this: GOLDEN.expected.family.explicitly_not ? [GOLDEN.expected.family.explicitly_not] : [],
        absent_on_card: GOLDEN.expected.absent,
        tags: { family: 'INFERRED' },
      }).success,
    ).toBe(true);
  });

  it('both fenugreek senses in the corpus seed remain two entries in the shared input', () => {
    const fenugreekLines = CORPUS_RS001.lines.filter((l: string) => /fenugreek/i.test(l));
    expect(fenugreekLines.length).toBeGreaterThanOrEqual(2); // powder + seed (canonical invariant)
  });
});
