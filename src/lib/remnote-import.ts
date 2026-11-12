/**
 * Reads a RemNote Markdown export into vocabulary items. Pure functions; the
 * import screen shows the result as a preview and saves it.
 *
 * RemNote writes one card per bullet line:
 *   - Wasser↔물              two-way card (front ↔ back)  -> vocab item
 *   - Wann wird …?→Antwort   one-way card                  -> skipped (grammar, M4)
 *   - ## Zahlen              heading                       -> section of the next cards
 * Whichever side contains Hangul becomes the Korean term; the other side is
 * the meaning.
 */

import { cleanText } from '@/lib/text';

/** section: the heading the card was under (used only to order new words). */
export type ImportedItem = { term: string; meaning: string; section: string };

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
  // term -> meanings (in file order) and the section of its first occurrence
  const byTerm = new Map<string, { meanings: string[]; section: string }>();
  let section = '';
  const skipped: SkippedLine[] = [];

  markdown.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.trim().replace(/^-\s*/, '').trim();
    if (text === '') return; // empty bullet
    if (text.startsWith('#')) {
      section = cleanSide(text.replace(/^#+/, ''));
      return;
    }
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

    const entry = byTerm.get(term) ?? { meanings: [], section };
    if (!entry.meanings.includes(meaning)) entry.meanings.push(meaning);
    byTerm.set(term, entry);
  });

  const merged: string[] = [];
  const items = [...byTerm].map(([term, entry]) => {
    if (entry.meanings.length > 1) merged.push(term);
    return { term, meaning: entry.meanings.join('; '), section: entry.section };
  });
  return { items, skipped, merged };
}

export type ExistingItem = { term: string; introduced: boolean };

export type ImportPlan = {
  /** Words not in the deck yet. */
  toAdd: ImportedItem[];
  /** Words in the deck but not learned yet: they get the new queue position. */
  requeue: ImportedItem[];
  /** Words already learned: left alone. */
  learned: ImportedItem[];
};

/** Splits parsed items by what the deck already has. Keeps the given order. */
export function planImport(
  items: readonly ImportedItem[],
  existing: readonly ExistingItem[],
): ImportPlan {
  const introduced = new Map(existing.map((e) => [cleanText(e.term), e.introduced]));
  const plan: ImportPlan = { toAdd: [], requeue: [], learned: [] };
  for (const item of items) {
    const state = introduced.get(item.term);
    if (state === undefined) plan.toAdd.push(item);
    else if (state) plan.learned.push(item);
    else plan.requeue.push(item);
  }
  return plan;
}
