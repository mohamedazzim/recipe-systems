// D-15 (P3-1): prompt-content contracts — the shared system prompt carries the
// canonical tag vocabulary + hard rules (Analysis Prompts §1); the mode overlays
// realize Recipe_Systems §7; every prompt carries its provenance pin.

import {
  CHEF_MODE_OVERLAY,
  HOME_MODE_OVERLAY,
  LLM_VIEWS,
  PROMPT_VERSION_PROVENANCE,
  SHARED_SYSTEM_PROMPT,
  systemPromptFor,
  VIEW_PROMPT_SPECS,
} from '../index';

describe('D-15 system prompts (Analysis Prompts §1 + Recipe_Systems §7)', () => {
  it('the shared prompt carries the six canonical tags and the hard rules', () => {
    for (const tag of ['CARD', 'METHOD', 'INFERRED', 'ABSENT', 'UNKNOWN', 'ASSUMED']) {
      expect(SHARED_SYSTEM_PROMPT).toContain(tag);
    }
    expect(SHARED_SYSTEM_PROMPT).toMatch(/ONLY source of truth/);
    expect(SHARED_SYSTEM_PROMPT).toMatch(/[Nn]ever issue a safety/);
    expect(SHARED_SYSTEM_PROMPT).toMatch(/keep them as two separate entries/i);
  });

  it('home overlay explains; chef overlay briefs (Recipe_Systems §7 line 32)', () => {
    expect(HOME_MODE_OVERLAY).toMatch(/Explain — never brief/);
    expect(CHEF_MODE_OVERLAY).toMatch(/briefing, not an essay/);
    expect(CHEF_MODE_OVERLAY).toMatch(/doneness and heat\s+over clock time/);
    expect(CHEF_MODE_OVERLAY).toMatch(/leave blank rather than invent/);
  });

  it('systemPromptFor(mode) = shared lens + exactly one mode overlay', () => {
    const home = systemPromptFor('home');
    const chef = systemPromptFor('chef');
    expect(home).toContain(SHARED_SYSTEM_PROMPT);
    expect(home).toContain('MODE: HOME');
    expect(home).not.toContain('MODE: CHEF');
    expect(chef).toContain('MODE: CHEF');
    expect(chef).not.toContain('MODE: HOME');
  });

  it('all seven LLM views carry provenance pins into the prompt doc', () => {
    for (const view of LLM_VIEWS) {
      expect(VIEW_PROMPT_SPECS[view].kind).toBe('llm');
      expect(VIEW_PROMPT_SPECS[view].provenance).toMatch(/Analysis Prompts §/);
      expect(VIEW_PROMPT_SPECS[view].prompt).toContain('OUTPUT SCHEMA');
      expect(VIEW_PROMPT_SPECS[view].modeFocus.home.length).toBeGreaterThan(0);
      expect(VIEW_PROMPT_SPECS[view].modeFocus.chef.length).toBeGreaterThan(0);
    }
  });

  it('the version provenance names both prompt documents (v2)', () => {
    expect(PROMPT_VERSION_PROVENANCE).toContain('Recipe_Systems_Analysis_Prompts.md v2');
    expect(PROMPT_VERSION_PROVENANCE).toContain('Deterministic_Views');
  });

  it('view 5 keeps its human-review gate and forbidden-language rules verbatim', () => {
    const v5 = VIEW_PROMPT_SPECS[5].prompt!;
    expect(v5).toContain('needs_review is ALWAYS true');
    expect(v5).toContain('FORBIDDEN LANGUAGE');
  });
});
