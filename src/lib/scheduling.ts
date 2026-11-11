/**
 * Spaced-repetition scheduling: a thin layer over ts-fsrs (CLAUDE.md rule 7:
 * no custom scheduling algorithm). These are pure functions: the scheduler is
 * passed in and the current time is a parameter, so tests are repeatable.
 *
 * Database rows use snake_case and ISO date strings; ts-fsrs cards use
 * camelCase and Date objects. This file is the only place that converts.
 */
import { DefaultScheduler } from 'ts-fsrs';

import type { Tables } from '@/lib/database.types';

// The FSRS model version is named explicitly: ReturnType<typeof DefaultScheduler>
// would mix the FSRS-6 and FSRS-7 card types.
export type Scheduler = DefaultScheduler<'FSRS-7'>;

/** The scheduling columns of a cards row (plus its id). */
export type CardRow = Pick<
  Tables<'cards'>,
  | 'id'
  | 'due_at'
  | 'stability'
  | 'stability_fast'
  | 'difficulty'
  | 'scheduled_days'
  | 'learning_step'
  | 'state'
  | 'schedule_status'
  | 'reps'
  | 'lapses'
  | 'last_review_at'
>;

/** The columns to write back to the cards row after a review. */
export type CardSchedule = Omit<CardRow, 'id'>;

/** 1 again, 2 hard, 3 good, 4 easy (same numbers as ts-fsrs Rating). */
export type ReviewRating = 1 | 2 | 3 | 4;
export const REVIEW_RATINGS: readonly ReviewRating[] = [1, 2, 3, 4];

/** A card as ts-fsrs accepts it for review. */
type FsrsCard = Parameters<Scheduler['review']>[0]['card'];

/** A card as ts-fsrs returns it after review. */
type ReviewedFsrsCard = ReturnType<Scheduler['review']>['card'];

type CardState = FsrsCard['state'];
type ScheduleStatus = FsrsCard['scheduleStatus'];

/**
 * The app's scheduler. Created once (it is async because ts-fsrs loads the
 * model). Fuzzing (random spread of long intervals) is off so results are
 * predictable; it can be switched on later without changing stored data.
 */
export function createScheduler(): Promise<Scheduler> {
  return DefaultScheduler({ version: 'FSRS-7', enableFuzz: false });
}

function toState(value: number): CardState {
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return value;
  }
  throw new Error(`Invalid FSRS state in database: ${value}`);
}

function toScheduleStatus(value: string): ScheduleStatus {
  if (value === 'new' || value === 'learning' || value === 'review') {
    return value;
  }
  throw new Error(`Invalid schedule_status in database: ${value}`);
}

/** Database row -> ts-fsrs card. */
export function rowToCard(row: CardRow): FsrsCard {
  return {
    cardId: row.id,
    dueAt: new Date(row.due_at),
    lastReviewAt: row.last_review_at === null ? null : new Date(row.last_review_at),
    stability: row.stability,
    stabilityFast: row.stability_fast,
    difficulty: row.difficulty,
    scheduledDays: row.scheduled_days,
    learningStep: row.learning_step,
    state: toState(row.state),
    scheduleStatus: toScheduleStatus(row.schedule_status),
    reps: row.reps,
    lapses: row.lapses,
  };
}

/** ts-fsrs card -> the columns to store. */
export function cardToSchedule(card: FsrsCard | ReviewedFsrsCard): CardSchedule {
  return {
    due_at: card.dueAt.toISOString(),
    last_review_at: card.lastReviewAt === null ? null : card.lastReviewAt.toISOString(),
    stability: card.stability,
    stability_fast: card.stabilityFast,
    difficulty: card.difficulty,
    scheduled_days: card.scheduledDays,
    learning_step: card.learningStep ?? 0, // optional on input cards; 0 = first step
    state: card.state,
    schedule_status: card.scheduleStatus,
    reps: card.reps,
    lapses: card.lapses,
  };
}

/** Applies one rating at time `now`; returns the card's new schedule. */
export function reviewCard(
  scheduler: Scheduler,
  row: CardRow,
  rating: ReviewRating,
  now: Date,
): CardSchedule {
  const result = scheduler.review({ card: rowToCard(row), grade: rating, now });
  return cardToSchedule(result.card);
}

/** For each rating, the interval in days the card would get (for button labels). */
export function previewIntervals(
  scheduler: Scheduler,
  row: CardRow,
  now: Date,
): Record<ReviewRating, number> {
  const intervals: Record<ReviewRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const item of scheduler.preview({ card: rowToCard(row), now })) {
    const days = (item.card.dueAt.getTime() - now.getTime()) / DAY_MS;
    intervals[item.grade as ReviewRating] = days; // preview yields grades 1-4 only
  }
  return intervals;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Short human label for an interval in days: "1m", "10m", "3h", "4d", "2mo", "1.5y". */
export function formatInterval(days: number): string {
  const minutes = days * 24 * 60;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = days / 365;
  return `${years < 10 ? Math.round(years * 10) / 10 : Math.round(years)}y`;
}
