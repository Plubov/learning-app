import { courseProgress, greeting, lessonStep, stepLabel, type LessonProgress } from '../course-progress';

function lesson(position: number, overrides: Partial<LessonProgress> = {}): LessonProgress {
  return {
    id: `l${position}`,
    position,
    title: `Lesson ${position}`,
    prepared_at: null,
    learned_at: null,
    completed_at: null,
    ...overrides,
  };
}

const T1 = '2026-11-10T10:00:00Z';
const T2 = '2026-11-11T10:00:00Z';
const T3 = '2026-11-12T10:00:00Z';

describe('lessonStep', () => {
  it('follows start, learn, practise, done', () => {
    expect(lessonStep(lesson(1))).toBe('start');
    expect(lessonStep(lesson(1, { prepared_at: T1 }))).toBe('learn');
    expect(lessonStep(lesson(1, { prepared_at: T1, learned_at: T2 }))).toBe('practise');
    expect(lessonStep(lesson(1, { prepared_at: T1, learned_at: T2, completed_at: T3 }))).toBe('done');
  });

  it('counts a practised lesson as done even without a recorded guided run', () => {
    expect(lessonStep(lesson(1, { prepared_at: T1, completed_at: T3 }))).toBe('done');
  });

  it('has a button text for every step', () => {
    expect(stepLabel('start')).toBe('step.start');
    expect(stepLabel('practise')).toBe('step.practise');
  });
});

describe('courseProgress', () => {
  it('finds the first open lesson in course order, whatever the order of the rows', () => {
    const progress = courseProgress([
      lesson(3),
      lesson(1, { prepared_at: T1, learned_at: T1, completed_at: T2 }),
      lesson(2, { prepared_at: T3 }),
    ]);
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(3);
    expect(progress.next?.id).toBe('l2');
    expect(progress.next?.step).toBe('learn');
    expect(progress.lastActivity).toBe(Date.parse(T3));
  });

  it('has no next lesson when all are done, and none in an empty course', () => {
    const done = { prepared_at: T1, learned_at: T1, completed_at: T2 };
    expect(courseProgress([lesson(1, done), lesson(2, done)]).next).toBeNull();
    expect(courseProgress([])).toEqual({ done: 0, total: 0, next: null, review: null, lastActivity: 0 });
  });

  it('offers the review after three finished lessons until it is done', () => {
    const done = { prepared_at: T1, learned_at: T1, completed_at: T2 };
    const four = [lesson(1, done), lesson(2, done), lesson(3, done), lesson(4)];
    expect(courseProgress(four).review?.afterId).toBe('l3');
    const reviewed = [...four.slice(0, 2), lesson(3, { ...done, review_completed_at: T3 }), lesson(4)];
    expect(courseProgress(reviewed).review).toBeNull();
  });

  it('skips over an open lesson only when it is done', () => {
    const progress = courseProgress([lesson(1), lesson(2, { prepared_at: T1, completed_at: T2 })]);
    expect(progress.next?.id).toBe('l1');
    expect(progress.next?.step).toBe('start');
  });
});

describe('greeting', () => {
  it('fits the time of day', () => {
    expect(greeting(8)).toBe('greeting.morning');
    expect(greeting(12)).toBe('greeting.afternoon');
    expect(greeting(18)).toBe('greeting.evening');
    expect(greeting(3)).toBe('greeting.night');
  });
});
