import { pickKoreanVoice, pickVoice, splitKorean, targetSpeech, textForSpeech } from '../speech-text';

const VoiceQuality = { Default: 'Default', Enhanced: 'Enhanced' } as const;

describe('pickKoreanVoice', () => {
  const english = { identifier: 'en', language: 'en-US', quality: VoiceQuality.Enhanced };
  const korean = { identifier: 'ko', language: 'ko-KR', quality: VoiceQuality.Default };
  const koreanEnhanced = { identifier: 'ko+', language: 'ko-KR', quality: VoiceQuality.Enhanced };

  it('returns null when there is no Korean voice', () => {
    expect(pickKoreanVoice([english])).toBeNull();
    expect(pickKoreanVoice([])).toBeNull();
  });

  it('picks a Korean voice', () => {
    expect(pickKoreanVoice([english, korean])).toBe('ko');
  });

  it('prefers an enhanced Korean voice', () => {
    expect(pickKoreanVoice([korean, koreanEnhanced])).toBe('ko+');
  });

  it('accepts Android-style language codes', () => {
    expect(
      pickKoreanVoice([{ identifier: 'a', language: 'ko_KR', quality: VoiceQuality.Default }]),
    ).toBe('a');
  });
});

describe('pickVoice', () => {
  const voices = [
    { identifier: 'ko', language: 'ko-KR', quality: 'Default' },
    { identifier: 'en-gb', language: 'en_GB', quality: 'Default' },
    { identifier: 'en-us+', language: 'en-US', quality: 'Enhanced' },
    { identifier: 'eng', language: 'eng', quality: 'Enhanced' },
  ];

  it('picks a voice of the language, preferring enhanced ones', () => {
    expect(pickVoice(voices, 'en')).toBe('en-us+');
    expect(pickVoice(voices, 'KO')).toBe('ko');
  });

  it('does not match a longer language code that starts the same', () => {
    expect(pickVoice([voices[3]], 'en')).toBeNull();
  });

  it('returns null for a language without a voice', () => {
    expect(pickVoice(voices, 'ja')).toBeNull();
  });
});

describe('textForSpeech', () => {
  it('leaves a plain word unchanged', () => {
    expect(textForSpeech('학교')).toBe('학교');
  });

  it('reads alternatives with a pause', () => {
    expect(textForSpeech('정말 / 진짜')).toBe('정말, 진짜');
  });

    it('leaves out placeholders', () => {
    expect(textForSpeech('저는 [Name]입니다')).toBe('저는 입니다');
  });

  it('leaves out blanks and the marks of grammar patterns', () => {
    expect(textForSpeech('__요')).toBe('요');
    expect(textForSpeech('저는 ___ 가요')).toBe('저는 가요');
    expect(textForSpeech('…요')).toBe('요');
    expect(textForSpeech('-아/어요')).toBe('아, 어요');
    expect(textForSpeech('~고 싶다')).toBe('고 싶다');
    expect(textForSpeech('N + -(으)로')).toBe('N + (으)로');
  });

  it('keeps hyphens inside words', () => {
    expect(textForSpeech('e-mail')).toBe('e-mail');
  });
});

describe('targetSpeech', () => {
  it('keeps only the Korean of a mixed text', () => {
    expect(targetSpeech('물 주세요. (Water, please.)', 'ko')).toBe('물 주세요.');
    expect(targetSpeech('Ask for 물 and you get water.', 'ko')).toBe('물');
    expect(targetSpeech('학교 – school; 학생 – student', 'ko')).toBe('학교, 학생');
  });

  it('returns nothing for a text without Korean', () => {
    expect(targetSpeech('water', 'ko')).toBe('');
  });

  it('keeps a question or sentence with its punctuation', () => {
    expect(targetSpeech('어디에 가요? = Where are you going?', 'ko')).toBe('어디에 가요?');
  });

  it('cleans blanks inside the Korean', () => {
    expect(targetSpeech('__요 (polite ending)', 'ko')).toBe('요');
  });

  it('leaves other languages whole', () => {
    expect(targetSpeech('¿Dónde está?', 'es')).toBe('¿Dónde está?');
  });
});

describe('splitKorean', () => {
  it('gives each stretch the voice of its language, in order', () => {
    expect(splitKorean('Ask for 물 and you get water.', 'en')).toEqual([
      { text: 'Ask for', lang: 'en' },
      { text: '물', lang: 'ko' },
      { text: 'and you get water.', lang: 'en' },
    ]);
  });

  it('drops brackets and stretches without words', () => {
    expect(splitKorean('Water (물).', 'en')).toEqual([
      { text: 'Water', lang: 'en' },
      { text: '물.', lang: 'ko' },
    ]);
  });

  it('reads only the Korean when the other language is unknown', () => {
    expect(splitKorean('Say 안녕하세요 to greet.', null)).toEqual([{ text: '안녕하세요', lang: 'ko' }]);
  });

  it('reads a text without Korean in one piece', () => {
    expect(splitKorean('Thirsty in Seoul?', 'en')).toEqual([{ text: 'Thirsty in Seoul?', lang: 'en' }]);
  });
});
