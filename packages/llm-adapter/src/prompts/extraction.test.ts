import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from './extraction';

describe('extraction prompt — the source-faithful contract', () => {
  it('forbids inference, invention, and completion', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/never infer/i);
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/extract only what the source text states/i);
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/never use culinary knowledge/i);
  });

  it('requires every ingredient and step to carry a source excerpt', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/must carry a "source" field/i);
  });

  it('specifies the exact JSON schema as the only output shape', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('"recipes"');
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/Output valid JSON only/i);
  });

  it('injects ONLY the source text into the user prompt', () => {
    const user = buildExtractionUserPrompt('Chicken 500 g');
    expect(user).toContain('Chicken 500 g');
    expect(user).toMatch(/the ONLY source of truth/i);
  });

  it('pins a prompt version for reproducibility', () => {
    expect(EXTRACTION_PROMPT_VERSION).toBe('v1');
  });
});
