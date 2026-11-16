/**
 * Loads the cards of a review session: due cards of words already introduced,
 * plus new words up to each deck's daily limit. Used by the review screen and
 * by the "due" count on the home screen, so both always agree.
 *
 * Which decks take part:
 *   - the daily session (no deck given): every active deck;
 *   - a session for one deck (chosen on the home, course or deck screen):
 *     that deck only, whether it is active or paused.
 * Cards of priority decks come first.
 */
import { daysUntil, EARLY_REVIEW_DAYS } from '@/lib/exam';
import {
  isListeningUnlocked,
  newItemAllowance,
  orderSession,
  pickNewItems,
  priorityFirst,
  spreadSiblings,
  startOfLocalDay,
} from '@/lib/review-session';
import type { CardRow } from '@/lib/scheduling';
import { supabase } from '@/lib/supabase';

/**
 * Card types introduced with a new word. Listening cards are loaded
 * separately: they start once the word is known by sight.
 */
export const SESSION_CARD_TYPES = ['recognition', 'production'];

export type SessionCard = CardRow & {
  card_type: string;
  item_id: string;
  item: {
    term: string;
    meaning: string;
    notes: string | null;
    deck_id: string;
    /** Language of the item's deck ('ko', ...); null for decks that are not a language. */
    target_lang: string | null;
    /** The deck's exam date (YYYY-MM-DD), which changes how the card is scheduled; see exam.ts. */
    exam_date: string | null;
  };
};

export type SessionCards = {
  cards: SessionCard[];
  /** Whether more new words exist than the daily limit lets in now. */
  moreNewAvailable: boolean;
};

const CARD_COLUMNS =
  'id, item_id, card_type, due_at, stability, stability_fast, difficulty, scheduled_days, ' +
  'learning_step, state, schedule_status, reps, lapses, last_review_at, suspended';

type CardWithFlag = Omit<SessionCard, 'item'> & { suspended: boolean };
/** An item as loaded: with its deck's id, from which the deck's settings are filled in. */
type ItemText = { term: string; meaning: string; notes: string | null; deck_id: string };
type ReviewRow = CardWithFlag & { item: ItemText };
type ListeningRow = CardWithFlag & {
  item: ItemText & { cards: { card_type: string; state: number }[] };
};
type NewItemRow = {
  id: string;
  deck_id: string;
  term: string;
  meaning: string;
  notes: string | null;
  cards: CardWithFlag[];
};

const MAX_REVIEW_CARDS = 500;
const MAX_NEW_ITEMS = 1000;
/** Cards brought forward per deck and session in the last week before its exam. */
const MAX_EARLY_CARDS = 40;

/**
 * @param extraNew new words per deck allowed beyond today's limit
 *   ("study more"); 0 for a normal session.
 * @param deckId study this deck only; without it, all active decks.
 */
export async function loadSessionCards(extraNew: number, deckId?: string): Promise<SessionCards> {
  const now = new Date();

  const allDecks = await supabase
    .from('decks')
    .select('id, new_per_day, target_lang, active, priority, exam_date');
  if (allDecks.error) throw new Error(allDecks.error.message);
  const decks = (allDecks.data ?? []).filter((deck) => (deckId ? deck.id === deckId : deck.active));
  if (decks.length === 0) return { cards: [], moreNewAvailable: false };
  const deckIds = decks.map((deck) => deck.id);
  const deckOf = Object.fromEntries(decks.map((deck) => [deck.id, deck]));
  const isPriority = (id: string) => deckOf[id]?.priority === true;

  // Decks with an exam within a week: their cards scheduled for after the
  // exam are reviewed early, so each is seen once more before it.
  const examSoon = decks.filter((deck) => {
    if (!deck.exam_date) return false;
    const days = daysUntil(deck.exam_date, now);
    return days >= 1 && days <= EARLY_REVIEW_DAYS;
  });

  const [reviews, listening, introducedToday, newItems, ...early] = await Promise.all([
    // Due cards of words that have been introduced (seen at least once).
    supabase
      .from('cards')
      .select(`${CARD_COLUMNS}, item:items!inner(term, meaning, notes, deck_id)`)
      .not('item.introduced_at', 'is', null)
      .in('item.deck_id', deckIds)
      .eq('suspended', false)
      .in('card_type', SESSION_CARD_TYPES)
      .lte('due_at', now.toISOString())
      .order('due_at')
      .limit(MAX_REVIEW_CARDS)
      .overrideTypes<ReviewRow[], { merge: false }>(),
    // Due listening cards of introduced words, with the states of their
    // siblings to check whether the recognition card has graduated.
    supabase
      .from('cards')
      .select(`${CARD_COLUMNS}, item:items!inner(term, meaning, notes, deck_id, cards(card_type, state))`)
      .not('item.introduced_at', 'is', null)
      .in('item.deck_id', deckIds)
      .eq('suspended', false)
      .eq('card_type', 'listening')
      .lte('due_at', now.toISOString())
      .order('due_at')
      .limit(MAX_REVIEW_CARDS)
      .overrideTypes<ListeningRow[], { merge: false }>(),
    // Words introduced today, per deck, for the daily limit.
    supabase
      .from('items')
      .select('deck_id')
      .in('deck_id', deckIds)
      .gte('introduced_at', startOfLocalDay(now).toISOString())
      .range(0, 9999),
    // Words never shown yet, in learning order: words added by hand (no
    // position) first, then the import queue (see learning-order.ts).
    supabase
      .from('items')
      .select(`id, deck_id, term, meaning, notes, cards(${CARD_COLUMNS})`)
      .in('deck_id', deckIds)
      .is('introduced_at', null)
      .order('new_position', { nullsFirst: true })
      .order('created_at')
      .limit(MAX_NEW_ITEMS)
      .overrideTypes<NewItemRow[], { merge: false }>(),
    ...examSoon.map((deck) =>
      supabase
        .from('cards')
        .select(`${CARD_COLUMNS}, item:items!inner(term, meaning, notes, deck_id)`)
        .not('item.introduced_at', 'is', null)
        .eq('item.deck_id', deck.id)
        .eq('suspended', false)
        .in('card_type', SESSION_CARD_TYPES)
        // Due on the exam day or later (the date is compared as UTC, which
        // is exact enough for "after the exam").
        .gte('due_at', `${deck.exam_date}T00:00:00Z`)
        .order('due_at')
        .limit(MAX_EARLY_CARDS)
        .overrideTypes<ReviewRow[], { merge: false }>(),
    ),
  ]);
  const failed =
    reviews.error ??
    listening.error ??
    introducedToday.error ??
    newItems.error ??
    early.find((result) => result.error)?.error;
  if (failed) throw new Error(failed.message);
  // Without an error the data is present; "?? []" below only satisfies TypeScript.

  const todayCount: Record<string, number> = {};
  for (const { deck_id } of introducedToday.data ?? []) {
    todayCount[deck_id] = (todayCount[deck_id] ?? 0) + 1;
  }
  const allowance: Record<string, number> = {};
  for (const deck of decks) {
    allowance[deck.id] = newItemAllowance(deck.new_per_day, todayCount[deck.id] ?? 0, extraNew);
  }
  const withDeck = (item: ItemText): SessionCard['item'] => ({
    ...item,
    target_lang: deckOf[item.deck_id]?.target_lang ?? null,
    exam_date: deckOf[item.deck_id]?.exam_date ?? null,
  });

  const waiting = priorityFirst(newItems.data ?? [], (item) => isPriority(item.deck_id));
  const picked = pickNewItems(waiting, allowance);
  const newCards: SessionCard[] = picked.flatMap(({ deck_id, term, meaning, notes, cards }) =>
    cards
      .filter((c) => !c.suspended && SESSION_CARD_TYPES.includes(c.card_type))
      .map(({ suspended: _suspended, ...card }) => ({
        ...card,
        item: withDeck({ deck_id, term, meaning, notes }),
      })),
  );
  const reviewCards: SessionCard[] = [...(reviews.data ?? []), ...early.flatMap((r) => r.data ?? [])].map(
    ({ suspended: _suspended, item, ...card }) => ({ ...card, item: withDeck(item) }),
  );
  for (const { suspended: _suspended, item, ...card } of listening.data ?? []) {
    const recognition = item.cards.find((c) => c.card_type === 'recognition');
    if (isListeningUnlocked(card.state, recognition?.state)) {
      const { cards: _siblings, ...itemText } = item;
      reviewCards.push({ ...card, item: withDeck(itemText) });
    }
  }
  // Reviews and unlocked listening cards together, most overdue first, then
  // the priority decks' cards moved to the front.
  reviewCards.sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const ordered = priorityFirst(reviewCards, (card) => isPriority(card.item.deck_id));

  return {
    cards: spreadSiblings(orderSession(ordered, newCards)),
    moreNewAvailable: picked.length < (newItems.data ?? []).length,
  };
}
