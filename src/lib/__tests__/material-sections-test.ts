import {
  cleanChoice,
  SECTION_CHARS,
  sectionPreview,
  splitSections,
} from '../../../supabase/functions/_shared/material-sections';

const paragraph = (words: number, word = 'word') => Array(words).fill(word).join(' ');

describe('splitSections', () => {
  it('cuts at headings and names each section after its heading', () => {
    const text = `# Special relativity\n\n${paragraph(300)}\n\n## Time dilation\n\n${paragraph(300)}`;
    const sections = splitSections(text);
    expect(sections.map((s) => s.heading)).toEqual(['Special relativity', 'Time dilation']);
    expect(sections[1].text.startsWith('## Time dilation')).toBe(true);
  });

  it('joins a short section with what follows', () => {
    const text = `# Chapter 2\n\n## Overview\n\nShort.\n\n## Details\n\n${paragraph(300)}`;
    const sections = splitSections(text);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe('Chapter 2');
    expect(sections[0].text).toContain('## Details');
  });

  it('cuts a long section between paragraphs and loses nothing', () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => paragraph(200, `p${i}`));
    const sections = splitSections(`# Long\n\n${paragraphs.join('\n\n')}`);
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) expect(section.text.length).toBeLessThanOrEqual(SECTION_CHARS);
    const all = sections.map((s) => s.text).join('\n\n');
    for (let i = 0; i < 12; i++) expect(all).toContain(`p${i} p${i}`);
  });

  it('cuts even a single huge paragraph', () => {
    const sections = splitSections('x'.repeat(SECTION_CHARS * 2 + 10));
    expect(sections).toHaveLength(3);
    expect(sections.map((s) => s.text.length).reduce((a, b) => a + b)).toBe(SECTION_CHARS * 2 + 10);
  });

  it('gives the same sections for the same text', () => {
    const text = `# A\n\n${paragraph(900)}\n\n# B\n\n${paragraph(100)}`;
    expect(splitSections(text)).toEqual(splitSections(text));
  });

  it('returns nothing for empty text', () => {
    expect(splitSections('  \n\n ')).toEqual([]);
  });
});

describe('sectionPreview', () => {
  it('shows the start of the body without the heading', () => {
    const preview = sectionPreview({ heading: 'A', text: `# A\n\n${paragraph(100)}` }, 20);
    expect(preview.startsWith('word word')).toBe(true);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('cleanChoice', () => {
  it('keeps valid numbers once, in the order given, up to the maximum', () => {
    expect(cleanChoice({ sections: [3, 1, 3, 0, 2] }, 5, 3)).toEqual([3, 1, 0]);
  });

  it('drops what does not point at a section', () => {
    expect(cleanChoice({ sections: [5, -1, 1.5, '2', 4] }, 5, 10)).toEqual([4]);
    expect(cleanChoice({ sections: 'all' }, 5, 10)).toEqual([]);
    expect(cleanChoice(null, 5, 10)).toEqual([]);
  });
});
