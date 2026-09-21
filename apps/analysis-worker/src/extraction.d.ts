// Ambient declarations for the Phase 2 document-extraction libraries
// (neither ships first-party TypeScript types; both are CommonJS).

declare module 'pdf-parse' {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    text: string;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export = pdfParse;
}

declare module 'mammoth' {
  interface MammothResult {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(input: { buffer: Buffer }): Promise<MammothResult>;
}
