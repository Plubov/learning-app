/**
 * Reads a RemNote Markdown export into vocabulary items. Pure functions; the
 * import screen shows the result as a preview and saves it.
 *
 * RemNote writes one card per bullet line:
 *   - Wasser↔물              two-way card (front ↔ back)  -> vocab item
 *   - Wann wird …?→Antwort   one-way card                  -> skipped (grammar, M4)
 *   - ## Zahlen              heading                       -> ignored
 * Whichever side contains Hangul becomes the Korean term; the other side is
 * the meaning.
 */

import { cleanText } from '@/lib/text';

export type ImportedItem = { term: string; meaning: string };

export type SkippedLine = {
  line: number; // 1-based, as in an editor
  text: string;
  reason: 'one-way' | 'no-korean' | 'not-a-card';
};

export type ParsedExport = {
  items: ImportedItem[];
  skipped: SkippedLine[];
  /** Terms that occurred more than once; their meanings were combined. */
  merged: string[];
};

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const TWO_WAY = '↔';
const ONE_WAY = '→';

/** Text of one card side: NFC, no Markdown bold, single spaces. */
function cleanSide(side: string): string {
  return cleanText(side.replace(/\*\*/g, '')).replace(/\s+/g, ' ');
}

export function parseRemNoteMarkdown(markdown: string): ParsedExport {
  const byTerm = new Map<string, string[]>(); // term -> meanings, in file order
  const skipped: SkippedLine[] = [];

  markdown.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.trim().replace(/^-\s*/, '').trim();
    if (text === '' || text.startsWith('#')) return; // empty bullet or heading
    const line = index + 1;

    // The first arrow is the separator; a later one belongs to the answer.
    const at = text.indexOf(TWO_WAY);
    const oneWayAt = text.indexOf(ONE_WAY);
    if (oneWayAt !== -1 && (at === -1 || oneWayAt < at)) {
      skipped.push({ line, text, reason: 'one-way' });
      return;
    }
    if (at === -1) {
      skipped.push({ line, text, reason: 'not-a-card' });
      return;
    }

    const front = cleanSide(text.slice(0, at));
    const back = cleanSide(text.slice(at + TWO_WAY.length));
    // The Korean side is the back unless only the front has Hangul.
    const frontIsKorean = HANGUL.test(front) && !HANGUL.test(back);
    const term = frontIsKorean ? front : back;
    const meaning = frontIsKorean ? back : front;
    if (!HANGUL.test(term) || meaning === '') {
      skipped.push({ line, text, reason: 'no-korean' });
      return;
    }

    const meanings = byTerm.get(term) ?? [];
    if (!meanings.includes(meaning)) meanings.push(meaning);
    byTerm.set(term, meanings);
  });

  const merged: string[] = [];
  const items = [...byTerm].map(([term, meanings]) => {
    if (meanings.length > 1) merged.push(term);
    return { term, meaning: meanings.join('; ') };
  });
  return { items, skipped, merged };
}

/** Splits parsed items into new ones and ones the deck already has. */
export function planImport(
  items: readonly ImportedItem[],
  existingTerms: readonly string[],
): { toAdd: ImportedItem[]; alreadyPresent: ImportedItem[] } {
  const existing = new Set(existingTerms.map(cleanText));
  const toAdd: ImportedItem[] = [];
  const alreadyPresent: ImportedItem[] = [];
  for (const item of items) {
    (existing.has(item.term) ? alreadyPresent : toAdd).push(item);
  }
  return { toAdd, alreadyPresent };
}
