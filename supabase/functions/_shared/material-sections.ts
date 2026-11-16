/**
 * Cuts course material into sections, so a lesson can be given only the
 * sections that belong to it instead of everything the learner uploaded.
 *
 * The cut is deterministic: the same text always gives the same sections, so
 * a section can be remembered as "section 3 of source X" (lessons.material_refs)
 * without storing the sections themselves. A source's text does not change
 * once it has been read.
 *
 * Pure functions without imports, like course-schemas.ts: used by the Edge
 * Function and tested from the app's unit tests.
 */

export type Section = {
  /** The Markdown heading the section starts under, or its first words. */
  heading: string;
  text: string;
};

/** A section is at most this long, in characters (about 1,000 tokens). */
export const SECTION_CHARS = 4000;
/** Shorter pieces are joined with their neighbour: a heading alone says nothing. */
const MIN_CHARS = 800;
const HEADING = /^#{1,4}\s+\S/;

/** Pieces of at most `max` characters, cut between paragraphs where possible. */
function cutLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const pieces: string[] = [];
  let current = '';
  for (const paragraph of text.split(/\n{2,}/)) {
    if (current !== '' && current.length + paragraph.length + 2 > max) {
      pieces.push(current);
      current = '';
    }
    let rest = paragraph;
    // A single paragraph longer than a section (a huge table, a wall of text).
    while (rest.length > max) {
      pieces.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    current = current === '' ? rest : `${current}\n\n${rest}`;
  }
  if (current !== '') pieces.push(current);
  return pieces;
}

function headingOf(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim() !== '') ?? '';
  const cleaned = firstLine.replace(/^#+\s*/, '').trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 77).trimEnd()}…` : cleaned;
}

export function splitSections(text: string): Section[] {
  // 1. Cut at Markdown headings.
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of text.split('\n')) {
    if (HEADING.test(line) && current.some((l) => l.trim() !== '')) {
      blocks.push(current.join('\n').trim());
      current = [];
    }
    current.push(line);
  }
  if (current.some((l) => l.trim() !== '')) blocks.push(current.join('\n').trim());

  // 2. Cut what is too long, 3. join what is too short with what follows.
  const pieces = blocks.flatMap((block) => cutLong(block, SECTION_CHARS));
  const joined: string[] = [];
  for (const piece of pieces) {
    const last = joined[joined.length - 1];
    if (
      last !== undefined &&
      (last.length < MIN_CHARS || piece.length < MIN_CHARS) &&
      last.length + piece.length + 2 <= SECTION_CHARS
    ) {
      joined[joined.length - 1] = `${last}\n\n${piece}`;
    } else {
      joined.push(piece);
    }
  }
  return joined.map((piece) => ({ heading: headingOf(piece), text: piece }));
}

/** One line of the list a model chooses sections from. */
export function sectionPreview(section: Section, chars = 160): string {
  const body = section.text
    .split('\n')
    .filter((line) => !HEADING.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return body.length > chars ? `${body.slice(0, chars).trimEnd()}…` : body;
}

/**
 * The model's choice, checked: whole numbers that point at existing
 * sections, each once, at most `max`. Anything else is dropped rather than
 * rejected: a wrong number costs nothing, a failed lesson does.
 */
export function cleanChoice(value: unknown, count: number, max: number): number[] {
  if (typeof value !== 'object' || value === null) return [];
  const list = (value as { sections?: unknown }).sections;
  if (!Array.isArray(list)) return [];
  const chosen: number[] = [];
  for (const entry of list) {
    if (typeof entry !== 'number' || !Number.isInteger(entry)) continue;
    if (entry < 0 || entry >= count || chosen.includes(entry)) continue;
    chosen.push(entry);
    if (chosen.length === max) break;
  }
  return chosen;
}
