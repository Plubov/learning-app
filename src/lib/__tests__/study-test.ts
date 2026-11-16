import { titleFromText } from '../study';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/uploads', () => ({}));

describe('titleFromText', () => {
  it('uses the first line, without a Markdown heading mark', () => {
    expect(titleFromText('# Lecture 3\n\nThe Lorentz transformation ...')).toBe('Lecture 3');
    expect(titleFromText('  Special relativity  \nmore')).toBe('Special relativity');
  });

  it('cuts a long first line', () => {
    const title = titleFromText('x'.repeat(200));
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('…')).toBe(true);
  });

  it('has a fallback for text without a usable first line', () => {
    expect(titleFromText('   ')).toBe('Pasted text');
  });
});
