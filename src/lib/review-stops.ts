/**
 * Review stops on the course path: after every third lesson the learner
 * reviews everything learned so far. Pure functions, so they can be tested;
 * the session is built in exercises.ts (buildReviewExercises), the stop is
 * drawn in src/components/course-path.tsx.
 *
 * A stop belongs to the lesson it follows ("after lesson 3"); stored is only
 * when its review was first finished (lessons.review_completed_at).
 */

/** A review stop follows every this many lessons. */
export const REVIEW_EVERY = 3;

export type ReviewLesson = {
  id: string;
  position: number;
  /** The lesson's practice is finished. */
  completed: boolean;
  /** The review after this lesson was finished at least once. */
  reviewed: boolean;
};

export type ReviewStop = {
  /** The lesson the stop follows. */
  afterId: string;
  /** Its position, for "lessons 1 to 3". */
  afterPosition: number;
  /** Every lesson up to and including that one: what is reviewed. */
  lessonIds: string[];
  done: boolean;
  /** All its lessons are finished, so the review can be done. */
  ready: boolean;
};

/** The review stops of a course, in path order. */
export function reviewStops(lessons: readonly ReviewLesson[]): ReviewStop[] {
  const ordered = [...lessons].sort((a, b) => a.position - b.position);
  const stops: ReviewStop[] = [];
  ordered.forEach((lesson, index) => {
    if ((index + 1) % REVIEW_EVERY !== 0) return;
    const covered = ordered.slice(0, index + 1);
    stops.push({
      afterId: lesson.id,
      afterPosition: lesson.position,
      lessonIds: covered.map((l) => l.id),
      done: lesson.reviewed,
      ready: covered.every((l) => l.completed),
    });
  });
  return stops;
}

/**
 * The review to do now: the first one that is ready and not done yet. It
 * comes before the next lesson, so it is offered as the next step even when
 * the learner has already gone on to later lessons.
 */
export function dueReview(stops: readonly ReviewStop[]): ReviewStop | null {
  return stops.find((stop) => stop.ready && !stop.done) ?? null;
}
