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
