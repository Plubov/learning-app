import { PDFDocument } from 'pdf-lib';

import { partRanges, splitPdf } from '../pdf-split';

async function pdfWithPages(count: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let i = 0; i < count; i++) {
    // Each page gets its own width, so the order can be checked afterwards.
    document.addPage([100 + i, 200]);
  }
  return document.save();
}

describe('partRanges', () => {
  it('covers every page once, in order', () => {
    expect(partRanges(10, 4)).toEqual([
      [0, 3],
      [4, 7],
      [8, 9],
    ]);
    expect(partRanges(4, 4)).toEqual([[0, 3]]);
    expect(partRanges(0, 4)).toEqual([]);
  });
});

describe('splitPdf', () => {
  it('returns a short PDF unchanged', async () => {
    const bytes = await pdfWithPages(3);
    const parts = await splitPdf(bytes, 4);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toBe(bytes);
  });

  it('splits a long PDF into parts that keep the pages in order', async () => {
    const parts = await splitPdf(await pdfWithPages(10), 4);
    expect(parts).toHaveLength(3);
    const widths: number[] = [];
    for (const part of parts) {
      const document = await PDFDocument.load(part);
      for (const page of document.getPages()) widths.push(page.getWidth());
    }
    expect(widths).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  });
});
