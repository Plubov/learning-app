import {
  CARD_STATE,
  isListeningUnlocked,
  isDueInSession,
  LEARN_AHEAD_MS,
  newItemAllowance,
  orderSession,
  pickNewItems,
  spreadSiblings,
  startOfLocalDay,
  withoutListening,
} from '@/lib/review-session';

const card = (id: string, item_id: string) => ({ id, item_id });
const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe('spreadSiblings', () => {
  test('separates the two cards of each item', () => {
    const cards = [card('a1', 'a'), card('a2', 'a'), card('b1', 'b'), card('b2', 'b')];
    expect(ids(spreadSiblings(cards))).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  test('keeps the order when nothing is adjacent', () => {
    const cards = [card('a1', 'a'), card('b1', 'b'), card('c1', 'c')];
    expect(ids(spreadSiblings(cards))).toEqual(['a1', 'b1', 'c1']);
  });

  test('a single item keeps both cards', () => {
    const cards = [card('a1', 'a'), card('a2', 'a')];
    expect(ids(spreadSiblings(cards))).toEqual(['a1', 'a2']);
  });

  test('keeps every card exactly once and does not change the input', () => {
    const cards = [card('a1', 'a'), card('a2', 'a'), card('a3', 'a'), card('b1', 'b')];
    const copy = [...cards];
    expect(ids(spreadSiblings(cards)).sort()).toEqual(['a1', 'a2', 'a3', 'b1']);
    expect(cards).toEqual(copy);
  });

  test('empty list', () => {
    expect(spreadSiblings([])).toEqual([]);
  });
});

describe('isDueInSession', () => {
  const now = new Date('2026-03-01T09:00:00.000Z');
  const inMs = (ms: number) => new Date(now.getTime() + ms).toISOString();

  test('a card due in a minute comes back', () => {
    expect(isDueInSession(inMs(60 * 1000), now)).toBe(true);
  });

  test('the limit itself still counts', () => {
    expect(isDueInSession(inMs(LEARN_AHEAD_MS), now)).toBe(true);
  });

  test('a card due tomorrow does not come back', () => {
    expect(isDueInSession(inMs(24 * 60 * 60 * 1000), now)).toBe(false);
  });
});

describe('startOfLocalDay', () => {
  test('is midnight of the same local day', () => {
    const day = startOfLocalDay(new Date(2026, 10, 12, 23, 59));
    expect(day).toEqual(new Date(2026, 10, 12, 0, 0));
  });
});

describe('newItemAllowance', () => {
  test('is the limit minus what was introduced today', () => {
    expect(newItemAllowance(10, 3, 0)).toBe(7);
  });

  test('is never negative', () => {
    expect(newItemAllowance(10, 14, 0)).toBe(0);
  });

  test('"study more" adds on top, even after the limit is reached', () => {
    expect(newItemAllowance(10, 10, 5)).toBe(5);
    expect(newItemAllowance(10, 4, 5)).toBe(11);
  });
});

describe('pickNewItems', () => {
  const items = [
    { id: 'a1', deck_id: 'A' },
    { id: 'b1', deck_id: 'B' },
    { id: 'a2', deck_id: 'A' },
    { id: 'a3', deck_id: 'A' },
  ];

  test('takes the first items of each deck up to its allowance', () => {
    expect(pickNewItems(items, { A: 2, B: 5 }).map((i) => i.id)).toEqual(['a1', 'b1', 'a2']);
  });

  test('a deck without allowance contributes nothing', () => {
    expect(pickNewItems(items, { B: 1 }).map((i) => i.id)).toEqual(['b1']);
  });
});

describe('orderSession', () => {
  test('reviews first, then new recognition, then new production', () => {
    const review = { id: 'r', card_type: 'production' };
    const newCards = [
      { id: 'p1', card_type: 'production' },
      { id: 'c1', card_type: 'recognition' },
      { id: 'c2', card_type: 'recognition' },
    ];
    expect(orderSession([review], newCards).map((c) => c.id)).toEqual(['r', 'c1', 'c2', 'p1']);
  });
});

describe('isListeningUnlocked', () => {
  test('a new listening card waits while the recognition card is new or learning', () => {
    expect(isListeningUnlocked(CARD_STATE.new, CARD_STATE.new)).toBe(false);
    expect(isListeningUnlocked(CARD_STATE.new, CARD_STATE.learning)).toBe(false);
  });

  test('it starts once the recognition card has graduated', () => {
    expect(isListeningUnlocked(CARD_STATE.new, CARD_STATE.review)).toBe(true);
    expect(isListeningUnlocked(CARD_STATE.new, CARD_STATE.relearning)).toBe(true);
  });

  test('a started listening card is always shown when due', () => {
    expect(isListeningUnlocked(CARD_STATE.learning, CARD_STATE.new)).toBe(true);
    expect(isListeningUnlocked(CARD_STATE.review, undefined)).toBe(true);
  });

  test('without a recognition card a new listening card stays locked', () => {
    expect(isListeningUnlocked(CARD_STATE.new, undefined)).toBe(false);
  });
});

describe('withoutListening', () => {
  it('takes out the listening cards and keeps the order of the rest', () => {
    const cards = [
      { id: 'a', card_type: 'recognition' },
      { id: 'b', card_type: 'listening' },
      { id: 'c', card_type: 'production' },
      { id: 'd', card_type: 'listening' },
    ];
    const { kept, skipped } = withoutListening(cards);
    expect(ids(kept)).toEqual(['a', 'c']);
    expect(ids(skipped)).toEqual(['b', 'd']);
  });

  it('changes nothing when there are no listening cards', () => {
    const cards = [{ id: 'a', card_type: 'recognition' }];
    expect(withoutListening(cards)).toEqual({ kept: cards, skipped: [] });
  });
});
