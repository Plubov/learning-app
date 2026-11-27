import { dueReview, reviewStops, type ReviewLesson } from '../review-stops';

function lessons(count: number, done: number, reviewed: number[] = []): ReviewLesson[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `l${i + 1}`,
    position: i + 1,
    completed: i < done,
    reviewed: reviewed.includes(i + 1),
  }));
}

describe('reviewStops', () => {
  it('puts a stop after every third lesson', () => {
    expect(reviewStops(lessons(8, 0)).map((stop) => stop.afterId)).toEqual(['l3', 'l6']);
  });

  it('reviews every lesson up to the stop', () => {
    const [, second] = reviewStops(lessons(6, 6));
    expect(second.lessonIds).toEqual(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']);
  });

  it('follows the lesson order, not the order given', () => {
    const shuffled = [...lessons(3, 0)].reverse();
    expect(reviewStops(shuffled)[0].afterId).toBe('l3');
  });

  it('is ready once all its lessons are finished, and done once reviewed', () => {
    expect(reviewStops(lessons(3, 2))[0]).toMatchObject({ ready: false, done: false });
    expect(reviewStops(lessons(3, 3))[0]).toMatchObject({ ready: true, done: false });
    expect(reviewStops(lessons(3, 3, [3]))[0]).toMatchObject({ ready: true, done: true });
  });

  it('has no stop in a course of fewer than three lessons', () => {
    expect(reviewStops(lessons(2, 2))).toEqual([]);
  });
});

describe('dueReview', () => {
  it('is the first ready stop that is not done', () => {
    expect(dueReview(reviewStops(lessons(6, 6, [3])))?.afterId).toBe('l6');
  });

  it('stays due when later lessons were done first', () => {
    expect(dueReview(reviewStops(lessons(6, 5)))?.afterId).toBe('l3');
  });

  it('is null when nothing is ready or everything is reviewed', () => {
    expect(dueReview(reviewStops(lessons(6, 2)))).toBeNull();
    expect(dueReview(reviewStops(lessons(6, 6, [3, 6])))).toBeNull();
  });
});
