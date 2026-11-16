import { stars, stopOffset, stopState, trailDots } from '../course-path';

describe('stopOffset', () => {
  it('swings right, back, left and repeats', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(stopOffset)).toEqual([0, 1, 2, 1, 0, -1, -2, -1, 0, 1]);
  });

  it('never jumps more than one step between neighbours', () => {
    for (let i = 0; i < 40; i++) {
      expect(Math.abs(stopOffset(i + 1) - stopOffset(i))).toBe(1);
    }
  });
});

describe('stopState', () => {
  const lesson = { id: 'a', started: false, completed: false };

  it('tells done, current, open and ahead apart', () => {
    expect(stopState({ ...lesson, started: true, completed: true }, 'b')).toBe('done');
    expect(stopState(lesson, 'a')).toBe('current');
    expect(stopState({ ...lesson, started: true }, 'b')).toBe('open');
    expect(stopState(lesson, 'b')).toBe('ahead');
  });

  it('shows a finished lesson as done even if it is named as next', () => {
    expect(stopState({ ...lesson, started: true, completed: true }, 'a')).toBe('done');
  });
});

describe('stars', () => {
  it('gives one to three stars', () => {
    expect(stars(0)).toBe(1);
    expect(stars(0.4)).toBe(2);
    expect(stars(0.74)).toBe(2);
    expect(stars(0.75)).toBe(3);
  });
});

describe('trailDots', () => {
  it('spaces the dots evenly between two stops', () => {
    expect(trailDots(0, 2, 3)).toEqual([
      { x: 0.5, y: 0.25 },
      { x: 1, y: 0.5 },
      { x: 1.5, y: 0.75 },
    ]);
  });
});
