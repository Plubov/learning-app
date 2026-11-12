/**
 * Loads the cards of a review session: due cards of words already introduced,
 * plus new words up to each deck's daily limit. Used by the review screen and
 * by the "due" count on the home screen, so both always agree.
 */
import {
  newItemAllowance,
  orderSession,
  pickNewItems,
  spreadSiblings,
  startOfLocalDay,
} from '@/lib/review-session';
import type { CardRow } from '@/lib/scheduling';
import { supabase } from '@/lib/supabase';

/** Card types the review screen can show (listening and writing come later). */
export const SESSION_CARD_TYPES = ['recognition', 'production'];

export type SessionCard = CardRow & {
  card_type: string;
  item_id: string;
  item: { term: string; meaning: string; notes: string | null };
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

/**
 * @param extraNew new words per deck allowed beyond today's limit
 *   ("study more"); 0 for a normal session.
 */
export async function loadSessionCards(extraNew: number): Promise<SessionCards> {
  const now = new Date();

  const [reviews, decks, introducedToday, newItems] = await Promise.all([
    // Due cards of words that have been introduced (seen at least once).
    supabase
      .from('cards')
      .select(`${CARD_COLUMNS}, item:items!inner(term, meaning, notes)`)
      .not('item.introduced_at', 'is', null)
      .eq('suspended', false)
      .in('card_type', SESSION_CARD_TYPES)
      .lte('due_at', now.toISOString())
      .order('due_at')
      .limit(MAX_REVIEW_CARDS)
      .overrideTypes<(SessionCard & { suspended: boolean })[], { merge: false }>(),
    supabase.from('decks').select('id, new_per_day'),
    // Words introduced today, per deck, for the daily limit.
    supabase
      .from('items')
      .select('deck_id')
      .gte('introduced_at', startOfLocalDay(now).toISOString())
      .range(0, 9999),
    // Words never shown yet, in learning order: words added by hand (no
    // position) first, then the import queue (see learning-order.ts).
    supabase
      .from('items')
      .select(`id, deck_id, term, meaning, notes, cards(${CARD_COLUMNS})`)
      .is('introduced_at', null)
      .order('new_position', { nullsFirst: true })
      .order('created_at')
      .limit(MAX_NEW_ITEMS)
      .overrideTypes<NewItemRow[], { merge: false }>(),
  ]);
  const failed = reviews.error ?? decks.error ?? introducedToday.error ?? newItems.error;
  if (failed) throw new Error(failed.message);
  // Without an error the data is present; "?? []" below only satisfies TypeScript.

  const todayCount: Record<string, number> = {};
  for (const { deck_id } of introducedToday.data ?? []) {
    todayCount[deck_id] = (todayCount[deck_id] ?? 0) + 1;
  }
  const allowance: Record<string, number> = {};
  for (const deck of decks.data ?? []) {
    allowance[deck.id] = newItemAllowance(deck.new_per_day, todayCount[deck.id] ?? 0, extraNew);
  }

  const picked = pickNewItems(newItems.data ?? [], allowance);
  const newCards: SessionCard[] = picked.flatMap(({ term, meaning, notes, cards }) =>
    cards
      .filter((c) => !c.suspended && SESSION_CARD_TYPES.includes(c.card_type))
      .map(({ suspended: _suspended, ...card }) => ({ ...card, item: { term, meaning, notes } })),
  );
  const reviewCards: SessionCard[] = (reviews.data ?? []).map(
    ({ suspended: _suspended, ...card }) => card,
  );

  return {
    cards: spreadSiblings(orderSession(reviewCards, newCards)),
    moreNewAvailable: picked.length < (newItems.data ?? []).length,
  };
}
