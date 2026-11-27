import type { TextKey } from '@/lib/i18n/en';
import { dueReview, reviewStops, type ReviewStop } from '@/lib/review-stops';

/**
 * Where the learner stands in a course: which lesson is next and what there
 * is to do in it. Pure functions, so they can be tested; the loading is in
 * courses.ts.
 */

/** The columns of a lessons row that progress needs. */
export type LessonProgress = {
  id: string;
  position: number;
  title: string;
  prepared_at: string | null;
  learned_at: string | null;
  completed_at: string | null;
  /** When the review stop after this lesson was first finished (see review-stops.ts). */
  review_completed_at?: string | null;
};

/**
 * What comes next in a lesson:
 *   start     not opened yet (its content does not exist)
 *   learn     opened, the guided run not finished
 *   practise  guided run done, practice not finished
 *   done      practice finished
 * A finished practice counts as done even without the guided run: lessons
 * practised before the guided run was recorded must not open again.
 */
export type LessonStepKind = 'start' | 'learn' | 'practise' | 'done';

export function lessonStep(
  lesson: Pick<LessonProgress, 'prepared_at' | 'learned_at' | 'completed_at'>,
): LessonStepKind {
  if (lesson.completed_at !== null) return 'done';
  if (lesson.prepared_at === null) return 'start';
  return lesson.learned_at === null ? 'learn' : 'practise';
}

/** The key of the button text that takes the learner to that step. */
export function stepLabel(step: LessonStepKind): TextKey {
  return `step.${step}`;
}

export type CourseProgress = {
  done: number;
  total: number;
  /** The first lesson, in course order, that is not done; null when all are. */
  next: (LessonProgress & { step: LessonStepKind }) | null;
  /** A review stop that is due: offered before the next lesson. */
  review: ReviewStop | null;
  /** Time of the latest thing done in the course (ms since 1970); 0 if nothing. */
  lastActivity: number;
};

export function courseProgress(lessons: readonly LessonProgress[]): CourseProgress {
  const ordered = [...lessons].sort((a, b) => a.position - b.position);
  const next = ordered.find((lesson) => lesson.completed_at === null);
  const times = ordered.flatMap((lesson) =>
    [lesson.prepared_at, lesson.learned_at, lesson.completed_at]
      .filter((time) => time !== null)
      .map((time) => Date.parse(time)),
  );
  return {
    done: ordered.filter((lesson) => lesson.completed_at !== null).length,
    total: ordered.length,
    next: next ? { ...next, step: lessonStep(next) } : null,
    review: dueReview(
      reviewStops(
        ordered.map((lesson) => ({
          id: lesson.id,
          position: lesson.position,
          completed: lesson.completed_at !== null,
          reviewed: (lesson.review_completed_at ?? null) !== null,
        })),
      ),
    ),
    lastActivity: times.length > 0 ? Math.max(...times) : 0,
  };
}

/** The key of a greeting for the hour of the day (0 to 23). */
export function greeting(hour: number): TextKey {
  if (hour < 5) return 'greeting.night';
  if (hour < 12) return 'greeting.morning';
  if (hour < 18) return 'greeting.afternoon';
  return 'greeting.evening';
}
