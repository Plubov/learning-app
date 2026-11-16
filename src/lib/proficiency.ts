/**
 * Proficiency: how well the learner knows an item right now, from 0 to 1.
 * Pure functions (the current time is a parameter), so they can be tested.
 *
 * It is derived from the learning record, never stored:
 *   - the FSRS state of the item's cards (how far each card has come), and
 *   - the latest quiz answers about the item.
 * It only reads what ts-fsrs scheduled; it does not schedule anything
 * (CLAUDE.md rule 7). A lesson's or course's proficiency is the average of
 * its items.
 */

/** The columns of a cards row that proficiency needs. */
export type ProficiencyCard = {
  item_id: string;
  /** FSRS state: 0 new, 1 learning, 2 review, 3 relearning. */
  state: number;
  /** FSRS stability: days until recall drops to about 90%. */
  stability: number;
  scheduled_days: number;
  due_at: string;
  reps: number;
};

export type QuizAnswer = { item_id: string; correct: boolean | null; reviewed_at: string };

/** A card counts as fully mature once its memory is stable for a month. */
const MATURE_DAYS = 30;
/** Cards being (re)learned: seen, but not yet remembered over days. */
const LEARNING_STRENGTH = 0.3;
/** A review card starts here and grows to 1 with its stability. */
const REVIEW_BASE = 0.5;
/** Factor for a card that is overdue by more than its whole interval. */
const OVERDUE_FACTOR = 0.7;
/** How much the cards count against the quiz answers, when both exist. */
const CARD_WEIGHT = 0.7;
/** Only the latest answers per item count, so old mistakes fade. */
const QUIZ_WINDOW = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One card's strength, 0..1. */
export function cardStrength(card: ProficiencyCard, now: Date): number {
  if (card.reps === 0 || card.state === 0) return 0;
  if (card.state !== 2) return LEARNING_STRENGTH;
  const strength = REVIEW_BASE + (1 - REVIEW_BASE) * Math.min(1, card.stability / MATURE_DAYS);
  const overdueDays = (now.getTime() - Date.parse(card.due_at)) / DAY_MS;
  return overdueDays > card.scheduled_days ? strength * OVERDUE_FACTOR : strength;
}

/** Share of correct answers among the latest ones; null without any checked answer. */
export function quizAccuracy(answers: readonly QuizAnswer[]): number | null {
  const latest = answers
    .filter((a) => a.correct !== null)
    .sort((a, b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at))
    .slice(0, QUIZ_WINDOW);
  if (latest.length === 0) return null;
  return latest.filter((a) => a.correct).length / latest.length;
}

/** One item's proficiency from its cards and its quiz answers. */
export function itemProficiency(
  cards: readonly ProficiencyCard[],
  answers: readonly QuizAnswer[],
  now: Date,
): number {
  const cardScore = average(cards.map((card) => cardStrength(card, now)));
  const accuracy = quizAccuracy(answers);
  if (accuracy === null) return cardScore;
  if (cards.length === 0) return accuracy;
  return CARD_WEIGHT * cardScore + (1 - CARD_WEIGHT) * accuracy;
}

/** Proficiency for each of `itemIds`; items without cards or answers get 0. */
export function proficiencyByItem(
  itemIds: readonly string[],
  cards: readonly ProficiencyCard[],
  answers: readonly QuizAnswer[],
  now: Date,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const id of itemIds) {
    result[id] = itemProficiency(
      cards.filter((c) => c.item_id === id),
      answers.filter((a) => a.item_id === id),
      now,
    );
  }
  return result;
}

export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export type ProficiencyLevel = 'New' | 'Weak' | 'Getting there' | 'Strong';

/** The same bands the practice prompt uses to choose question difficulty. */
export function proficiencyLevel(score: number): ProficiencyLevel {
  if (score <= 0) return 'New';
  if (score < 0.4) return 'Weak';
  if (score < 0.75) return 'Getting there';
  return 'Strong';
}

/** The week of the course `now` falls in (1 = the week the plan was made). */
export function courseWeek(plannedAt: string, now: Date): number {
  return Math.max(1, Math.floor((now.getTime() - Date.parse(plannedAt)) / (7 * DAY_MS)) + 1);
}
