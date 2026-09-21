// Phase 2 document extraction — the ONLY responsibility is: document → raw text.
// Source-faithful by construction (spec §7): no inference, no summarization, no
// spelling/grammar "correction", no LLM, no recipe understanding. The output is
// returned byte-for-byte as each library yields it (line breaks preserved).
//
// Empty/unextractable content is a FAILURE (NO_TEXT_EXTRACTED) — never invented.

import pdfParse from 'pdf-parse';
import { extractRawText } from 'mammoth';

export const DOCUMENT_FILE_TYPES = ['pdf', 'docx', 'txt'] as const;
export type DocumentFileType = (typeof DOCUMENT_FILE_TYPES)[number];

export class DocumentExtractionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentExtractionError';
  }
}

/** TXT: decode as UTF-8, strip a leading BOM. Nothing else is touched. */
export function extractTxt(buffer: Buffer): string {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

/** DOCX: extract paragraphs in document order (mammoth preserves order + line breaks). */
async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await extractRawText({ buffer });
  return result.value;
}

/** PDF: extract textual content (pdf-parse preserves page order + line breaks). */
async function extractPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return typeof result.text === 'string' ? result.text : '';
}

/**
 * Dispatch extraction by file type. Throws DocumentExtractionError on
 * unreadable content or empty/unextractable text — callers mark the ingestion
 * record `failed` with the error code; no raw text is ever fabricated.
 */
export async function extractDocumentText(
  fileType: DocumentFileType,
  buffer: Buffer,
): Promise<string> {
  let text: string;
  try {
    if (fileType === 'txt') {
      text = extractTxt(buffer);
    } else if (fileType === 'docx') {
      text = await extractDocx(buffer);
    } else {
      text = await extractPdf(buffer);
    }
  } catch {
    throw new DocumentExtractionError(
      'EXTRACTION_FAILED',
      `The ${fileType.toUpperCase()} document could not be read.`,
    );
  }
  if (text.trim().length === 0) {
    throw new DocumentExtractionError(
      'NO_TEXT_EXTRACTED',
      `No text could be extracted from this ${fileType.toUpperCase()} document.`,
    );
  }
  return text;
}
