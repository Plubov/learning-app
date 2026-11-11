import { isDueInSession, LEARN_AHEAD_MS, spreadSiblings } from '@/lib/review-session';

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
