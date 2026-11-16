import { extensionFor, MAX_IMAGE_SIDE, scaledSize, uploadPath } from '../upload-path';

describe('uploadPath', () => {
  it('starts with the user id, then the course', () => {
    expect(uploadPath('user', 'course', 'image/jpeg', 'abc')).toBe('user/course/abc.jpg');
    expect(uploadPath('user', 'course', 'application/pdf', 'abc')).toBe('user/course/abc.pdf');
  });

  it('refuses file types the bucket does not take', () => {
    expect(() => uploadPath('user', 'course', 'video/mp4', 'abc')).toThrow();
    expect(extensionFor('IMAGE/PNG')).toBe('png');
    expect(extensionFor('text/plain')).toBeNull();
  });
});

describe('scaledSize', () => {
  it('leaves small images alone', () => {
    expect(scaledSize(1200, 900)).toBeNull();
    expect(scaledSize(MAX_IMAGE_SIDE, 100)).toBeNull();
  });

  it('scales the longer side down and keeps the shape', () => {
    expect(scaledSize(3600, 2700)).toEqual({ width: 1800, height: 1350 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1350, height: 1800 });
  });
});
