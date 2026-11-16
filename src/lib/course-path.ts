/**
 * Layout of the course path: the winding trail of lesson "stops" on the
 * course screen. Pure functions, so they can be tested; the drawing is in
 * src/components/course-path.tsx.
 */

/** How far a stop sits left (-) or right (+) of the middle, in steps. */
const WAVE = [0, 1, 2, 1, 0, -1, -2, -1] as const;

/**
 * The sideways position of the n-th stop of the course (0-based), from -2 to
 * 2. The trail swings right, back through the middle, left, and repeats; it
 * continues across stages, so the path reads as one road.
 */
export function stopOffset(index: number): number {
  return WAVE[((index % WAVE.length) + WAVE.length) % WAVE.length];
}

export type StopState = 'done' | 'current' | 'open' | 'ahead';

/**
 * How a stop looks:
 *   done     practice finished
 *   current  the next lesson to do (exactly one, unless all are done)
 *   open     opened before but not the next one (e.g. kept from an old plan)
 *   ahead    not opened yet
 */
export function stopState(
  lesson: { id: string; started: boolean; completed: boolean },
  nextId: string | null,
): StopState {
  if (lesson.completed) return 'done';
  if (lesson.id === nextId) return 'current';
  return lesson.started ? 'open' : 'ahead';
}

/** One to three stars for a finished lesson, from its proficiency (0..1). */
export function stars(proficiency: number): number {
  if (proficiency >= 0.75) return 3;
  return proficiency >= 0.4 ? 2 : 1;
}

/**
 * The small dots of the trail between two stops, as points between their
 * centres: x in offset steps, y as a share (0..1) of the distance down.
 */
export function trailDots(from: number, to: number, count = 3): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1);
    return { x: from + (to - from) * t, y: t };
  });
}
