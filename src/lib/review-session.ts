/**
 * Order of cards within one review session. Pure functions; this only
 * decides what is shown next, never when a card is due (that is ts-fsrs).
 */

/**
 * A card rated in this session comes back in the same session if its new
 * due time is at most this far away (e.g. "again" = due in 1 minute).
 */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

/** Whether a just-reviewed card should be shown again in this session. */
export function isDueInSession(dueAt: string, now: Date): boolean {
  return new Date(dueAt).getTime() - now.getTime() <= LEARN_AHEAD_MS;
}

/**
 * Keeps the given order but avoids showing two cards of the same item back
 * to back where possible, so the recognition card does not give away the
 * answer to the production card that follows.
 */
export function spreadSiblings<T extends { item_id: string }>(cards: readonly T[]): T[] {
  const remaining = [...cards];
  const result: T[] = [];
  while (remaining.length > 0) {
    const previous = result[result.length - 1];
    const index = previous ? remaining.findIndex((c) => c.item_id !== previous.item_id) : 0;
    result.push(...remaining.splice(index === -1 ? 0 : index, 1));
  }
  return result;
}

/** Local midnight of the given moment: "today" for the daily new-word limit. */
export function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * How many new items a deck may still introduce now: its daily limit minus
 * the items already introduced today, plus any extra the learner asked for
 * ("study more").
 */
export function newItemAllowance(newPerDay: number, introducedToday: number, extra: number): number {
  return Math.max(0, newPerDay - introducedToday) + Math.max(0, extra);
}

/**
 * The new items to show, in the given order (oldest first), taking at most
 * `allowance[deck_id]` items from each deck.
 */
export function pickNewItems<T extends { deck_id: string }>(
  newItems: readonly T[],
  allowance: Readonly<Record<string, number>>,
): T[] {
  const taken: Record<string, number> = {};
  return newItems.filter((item) => {
    const count = taken[item.deck_id] ?? 0;
    if (count >= (allowance[item.deck_id] ?? 0)) return false;
    taken[item.deck_id] = count + 1;
    return true;
  });
}

/**
 * Session order: due reviews first (as given), then the new items'
 * recognition cards, then their production cards, so a new word is seen
 * before it has to be typed.
 */
export function orderSession<T extends { card_type: string }>(
  reviewCards: readonly T[],
  newCards: readonly T[],
): T[] {
  return [
    ...reviewCards,
    ...newCards.filter((c) => c.card_type === 'recognition'),
    ...newCards.filter((c) => c.card_type !== 'recognition'),
  ];
}
