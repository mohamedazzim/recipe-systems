import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentExtractionError, extractDocumentText, extractTxt } from './extract';

const fixture = (name: string): Buffer => readFileSync(join(__dirname, '__fixtures__', name));

describe('extractTxt', () => {
  it('decodes UTF-8 and strips a leading BOM', () => {
    expect(extractTxt(Buffer.from('Fish 500g\nSalt'))).toBe('Fish 500g\nSalt');
    expect(extractTxt(Buffer.from('\uFEFFFish 500g', 'utf8'))).toBe('Fish 500g');
  });
});

describe('extractDocumentText', () => {
  it('extracts TXT source-faithfully (no transformation)', async () => {
    await expect(
      extractDocumentText('txt', Buffer.from('Fish 500g\r\nSalt to taste')),
    ).resolves.toBe('Fish 500g\r\nSalt to taste');
  });

  it('extracts DOCX text preserving paragraph order + line breaks', async () => {
    const text = await extractDocumentText('docx', fixture('minimal.docx'));
    expect(text).toContain('Fish 500g');
    expect(text).toContain('Salt to taste');
    // mammoth separates paragraphs with blank lines
    expect(text.indexOf('Fish 500g')).toBeLessThan(text.indexOf('Salt to taste'));
  });

  it('throws NO_TEXT_EXTRACTED for empty content (never invents text)', async () => {
    await expect(extractDocumentText('txt', Buffer.from('   \n  '))).rejects.toMatchObject({
      code: 'NO_TEXT_EXTRACTED',
    });
    await expect(extractDocumentText('txt', Buffer.alloc(0))).rejects.toMatchObject({
      code: 'NO_TEXT_EXTRACTED',
    });
  });

  it('throws EXTRACTION_FAILED for an unreadable PDF (no invented text)', async () => {
    await expect(extractDocumentText('pdf', fixture('minimal.pdf'))).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    });
    await expect(extractDocumentText('pdf', fixture('minimal.pdf'))).rejects.toBeInstanceOf(
      DocumentExtractionError,
    );
  });
});
