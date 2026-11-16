/**
 * Splits a PDF into parts of a few pages each, with pdf-lib (a library that
 * reads and writes PDF files in plain JavaScript, so it runs on the phone
 * and in the browser). Small parts are what keeps each AI reading call short
 * enough: see supabase/migrations/20261116161254_source_parts.sql.
 */
import { PDFDocument } from 'pdf-lib';

/** Pages per part: about a minute of reading per call. */
export const PAGES_PER_PART = 4;

/** The page ranges [first, last] (0-based, inclusive) of each part. */
export function partRanges(pageCount: number, pagesPerPart = PAGES_PER_PART): [number, number][] {
  const ranges: [number, number][] = [];
  for (let first = 0; first < pageCount; first += pagesPerPart) {
    ranges.push([first, Math.min(first + pagesPerPart, pageCount) - 1]);
  }
  return ranges;
}

/**
 * The PDF as several smaller PDFs, in page order. A PDF that already fits
 * into one part is returned as it is.
 */
export async function splitPdf(
  bytes: ArrayBuffer | Uint8Array,
  pagesPerPart = PAGES_PER_PART,
): Promise<Uint8Array[]> {
  const original = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Some PDFs are "encrypted" only to forbid editing; they can still be read.
  const source = await PDFDocument.load(original, { ignoreEncryption: true });
  const ranges = partRanges(source.getPageCount(), pagesPerPart);
  if (ranges.length <= 1) return [original];
  const parts: Uint8Array[] = [];
  for (const [first, last] of ranges) {
    const part = await PDFDocument.create();
    const indices = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    for (const page of await part.copyPages(source, indices)) part.addPage(page);
    parts.push(await part.save());
  }
  return parts;
}
