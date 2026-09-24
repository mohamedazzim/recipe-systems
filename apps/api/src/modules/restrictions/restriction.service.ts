// D-26 (P7-2) — H1/H3: the household restriction profile and the conflicts-first
// highlight. The API restriction module is the SOLE writer of
// account_restriction_profile / account_restriction_item (ADR §2 — Web API owns
// restriction writes; new QG2 one-writer gate). Reads of the frozen View 8 payload
// are read-only projections — the D-05 freeze holds.
//
// H1 wire (API doc §9, RS-US-37):
//   GET /me/restriction-profile  →  { profile_id, allergens[], diet_patterns[],
//                                     label_pack } (nulls when never configured —
//                                     the profile is optional, TC-02)
//   PUT /me/restriction-profile  →  strict canonical validation: allergen codes
//                                     must exist in dietary_allergen_definition;
//                                     diet patterns must be in the labeled PILOT
//                                     vocabulary; label_pack US|EU.
//
// H3 (RS-US-38 extension): GET /analysis/:analysisId/restriction-highlight — a
// read-time projection over the frozen View 8 payload + the profile rows:
// conflicts first; unknown shown as unknown, NEVER a pass; profile diet patterns
// carry no card data (shown as notes, never a pass); never auto-deletes recipes.
//
// Q-register labels (recorded 2026-09-15, D-26 preflight): diet-pattern
// vocabulary + label-pack precedence are ERD §15 OPEN items — PILOT_DIET_PATTERNS
// is a LABELED PILOT WORKING ASSUMPTION (IMPROVEMENT_PLAN P2-6), not a silent
// resolution.

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@recipe-systems/database';
import { View8PayloadSchema } from '@recipe-systems/schemas';
import type { Actor } from '../../common/guards/guest-or-jwt.guard';

/** Labeled pilot diet-pattern vocabulary (ERD §15 OPEN — D-26E). */
export const PILOT_DIET_PATTERNS = ['vegetarian', 'vegan', 'gluten-free'] as const;

export type DietPattern = (typeof PILOT_DIET_PATTERNS)[number];

export interface RestrictionProfileInput {
  allergens: string[]; // dietary_allergen_definition.codes
  dietPatterns: DietPattern[];
  labelPack: 'US' | 'EU';
}

export interface RestrictionProfileWire {
  profile_id: string | null;
  allergens: string[];
  diet_patterns: string[];
  label_pack: 'US' | 'EU' | null;
}

export interface RestrictionVocabularyWire {
  allergens: Array<{ code: string; name: string; label_pack: string | null }>;
  diet_patterns: readonly DietPattern[];
}

export interface RestrictionHighlightWire {
  conflicts: string[]; // profile allergens PRESENT on the card — first
  unknown: string[]; // profile allergens the card leaves UNKNOWN — never a pass
  not_flagged: string[]; // profile allergens absent from the card view — no pass claimed
  profile_notes: string[]; // diet patterns (no card data to compare) + label-pack note
  /**
   * BUG-023: true when this analysis has no USABLE allergen view — missing, not
   * COMPLETE (e.g. vetoed), or schema-invalid. The UI renders an explicit
   * "allergen check unavailable" state from this. It is a marker, not the safety
   * mechanism: the lists below stay conservative regardless (everything under
   * `unknown`, nothing under `not_flagged`), so a client that ignores this flag
   * still cannot read an all-clear.
   */
  unavailable: boolean;
}

@Injectable()
export class RestrictionService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /** H1 — the account profile; null-safe for never-configured accounts (TC-02). */
  async getProfile(accountId: string): Promise<RestrictionProfileWire> {
    const profile = await this.prisma.accountRestrictionProfile.findUnique({
      where: { accountId },
      include: { items: true },
    });
    if (!profile) {
      return { profile_id: null, allergens: [], diet_patterns: [], label_pack: null };
    }
    const [definitions, dietPatterns] = await Promise.all([
      this.prisma.dietaryAllergenDefinition.findMany({
        where: { id: { in: profile.items.map((i) => i.allergenId).filter((id): id is string => id !== null) } },
        select: { id: true, code: true },
      }),
      Promise.resolve(profile.items.map((i) => i.dietPattern).filter((p): p is string => p !== null)),
    ]);
    const codeById = new Map(definitions.map((d) => [d.id, d.code]));
    const allergens = profile.items
      .map((i) => (i.allergenId ? codeById.get(i.allergenId) ?? null : null))
      .filter((c): c is string => c !== null);
    return {
      profile_id: profile.id,
      allergens,
      diet_patterns: dietPatterns,
      label_pack: profile.labelPack as 'US' | 'EU',
    };
  }

  /** H1 — create/update; items are REPLACED wholesale (the profile is a single
   *  editable household config, never a log). Strict canonical validation. */
  async putProfile(accountId: string, input: RestrictionProfileInput): Promise<RestrictionProfileWire> {
    const definitions = await this.prisma.dietaryAllergenDefinition.findMany({
      where: { code: { in: input.allergens } },
      select: { id: true, code: true },
    });
    const unknownAllergens = input.allergens.filter(
      (code) => !definitions.some((d) => d.code === code),
    );
    if (unknownAllergens.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_RESTRICTION_PROFILE',
        message: `Unknown allergen code(s): ${unknownAllergens.join(', ')}`,
      });
    }
    const idByCode = new Map(definitions.map((d) => [d.code, d.id]));

    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.accountRestrictionProfile.upsert({
        where: { accountId },
        create: { accountId, labelPack: input.labelPack },
        update: { labelPack: input.labelPack },
      });
      await tx.accountRestrictionItem.deleteMany({ where: { restrictionProfileId: profile.id } });
      const rows = [
        ...input.allergens.map((code) => ({
          restrictionProfileId: profile.id,
          allergenId: idByCode.get(code) ?? null,
          dietPattern: null,
          restrictionType: 'allergen',
        })),
        ...input.dietPatterns.map((pattern) => ({
          restrictionProfileId: profile.id,
          allergenId: null,
          dietPattern: pattern,
          restrictionType: 'diet_pattern',
        })),
      ];
      if (rows.length > 0) {
        await tx.accountRestrictionItem.createMany({ data: rows });
      }
    });
    return this.getProfile(accountId);
  }

  /** H1 UI vocabulary — the canonical allergen codes + the labeled pilot
   *  diet-pattern list (read-only). */
  async vocabulary(): Promise<RestrictionVocabularyWire> {
    const definitions = await this.prisma.dietaryAllergenDefinition.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, name: true, labelPack: true },
    });
    return {
      allergens: definitions.map((d) => ({
        code: d.code,
        name: d.name,
        label_pack: d.labelPack,
      })),
      diet_patterns: PILOT_DIET_PATTERNS,
    };
  }

  /**
   * H3 — conflicts-first projection over the FROZEN View 8 payload (D-05) and the
   * profile rows. INV-17-style ownership: missing/foreign analysis → canonical
   * 404 (ANALYSIS_NOT_FOUND). Guests carry no profile → empty highlight.
   * Unknown stays unknown — a profile allergen the card leaves unknown is listed
   * under `unknown`, never under any pass category; an allergen the card does
   * not flag at all is listed under `not_flagged` with no pass claim.
   */
  async highlight(actor: Actor, analysisId: string): Promise<RestrictionHighlightWire> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      include: { recipe: true },
    });
    if (!analysis) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }
    const owns =
      actor.kind === 'user'
        ? analysis.recipe.accountId === actor.user.accountId
        : analysis.recipe.guestSessionId === actor.guestSessionId;
    if (!owns) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
    }

    // BUG-023: a missing, non-COMPLETE, or schema-invalid View 8 must never
    // collapse to "nothing flagged". Empty present/unknown sets put every
    // configured allergen into `not_flagged`, which on an allergy surface reads as
    // an all-clear — the one answer this module may never give. Two changes:
    //   - status is filtered in the WHERE (the BUG-022 treatment), so an
    //     INCOMPLETE row with a stale-but-parseable payload cannot feed the lists;
    //   - an unusable view is reported explicitly (see `unavailable` below) with
    //     every allergen routed to `unknown`.
    const view8Row = await this.prisma.analysisView.findFirst({
      where: { analysisId, viewNumber: 8, status: 'COMPLETE' },
      select: { payload: true },
    });
    const view8 = view8Row ? View8PayloadSchema.safeParse(view8Row.payload) : null;
    const allergenCheckAvailable = view8?.success === true;
    const present = new Set<string>();
    const unknown = new Set<string>();
    if (view8?.success) {
      for (const item of view8.data.present) present.add(item);
      for (const item of view8.data.unknown) unknown.add(item);
    }

    if (actor.kind !== 'user') {
      return { conflicts: [], unknown: [], not_flagged: [], profile_notes: [], unavailable: false };
    }

    const profile = await this.prisma.accountRestrictionProfile.findUnique({
      where: { accountId: actor.user.accountId },
      include: { items: true },
    });
    if (!profile) {
      return { conflicts: [], unknown: [], not_flagged: [], profile_notes: [], unavailable: false };
    }

    const allergenIds = profile.items
      .map((i) => i.allergenId)
      .filter((id): id is string => id !== null);
    const definitions = allergenIds.length
      ? await this.prisma.dietaryAllergenDefinition.findMany({
          where: { id: { in: allergenIds } },
          select: { name: true },
        })
      : [];
    const names = definitions.map((d) => d.name);

    const conflicts = names.filter((n) => present.has(n));
    const unknownHits = names.filter((n) => unknown.has(n));
    // Conservative default: with no usable allergen view NOTHING may be reported
    // as absent-from-the-card. Everything goes to `unknown` instead.
    const notFlagged = allergenCheckAvailable
      ? names.filter((n) => !present.has(n) && !unknown.has(n))
      : [];
    const profileNotes: string[] = [];
    if (!allergenCheckAvailable) {
      // An inline banner, not a throw: a blocked flow is worse than a stated gap on
      // a safety surface. Same posture as the diet-pattern notes below.
      profileNotes.push(
        'allergen check unavailable: this analysis has no usable allergen view — ' +
          'every configured allergen is shown as unknown, never as a pass',
      );
    }
    for (const pattern of profile.items
      .map((i) => i.dietPattern)
      .filter((p): p is string => p !== null)) {
      profileNotes.push(
        `diet pattern: ${pattern} (the card carries no diet-pattern data — shown as unknown, never a pass)`,
      );
    }
    profileNotes.push(`label pack: ${profile.labelPack}`);
    return {
      conflicts,
      unknown: allergenCheckAvailable ? unknownHits : names,
      not_flagged: notFlagged,
      profile_notes: profileNotes,
      unavailable: !allergenCheckAvailable,
    };
  }
}
