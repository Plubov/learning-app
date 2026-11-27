import {
  isNaturalVoice,
  pickVoice,
  splitKorean,
  targetSpeech,
  textForSpeech,
  voiceName,
  voiceOptions,
} from '../speech-text';

/** Voices as Edge on Windows lists them for Korean: the robotic desktop voice first. */
const edgeKorean = [
  { identifier: 'Microsoft Heami - Korean (Korean)', name: 'Microsoft Heami - Korean (Korean)', language: 'ko-KR', quality: 'Default', localService: true },
  { identifier: 'Microsoft SunHi Online (Natural) - Korean (Korea)', name: 'Microsoft SunHi Online (Natural) - Korean (Korea)', language: 'ko-KR', quality: 'Default', localService: false },
  { identifier: 'Microsoft InJoon Online (Natural) - Korean (Korea)', name: 'Microsoft InJoon Online (Natural) - Korean (Korea)', language: 'ko-KR', quality: 'Default', localService: false },
];

describe('pickVoice with Korean voices', () => {
  const english = { identifier: 'en', language: 'en-US', quality: 'Enhanced' };
  const korean = { identifier: 'ko', language: 'ko-KR', quality: 'Default' };
  const koreanEnhanced = { identifier: 'ko+', language: 'ko-KR', quality: 'Enhanced' };

  it('returns null when there is no Korean voice', () => {
    expect(pickVoice([english], 'ko')).toBeNull();
    expect(pickVoice([], 'ko')).toBeNull();
  });

  it('picks a Korean voice', () => {
    expect(pickVoice([english, korean], 'ko')).toBe('ko');
  });

  it('prefers an enhanced Korean voice', () => {
    expect(pickVoice([korean, koreanEnhanced], 'ko')).toBe('ko+');
  });

  it('accepts Android-style language codes', () => {
    expect(pickVoice([{ identifier: 'a', language: 'ko_KR', quality: 'Default' }], 'ko')).toBe('a');
  });

  it('prefers a natural online voice of the browser over the robotic one listed first', () => {
    expect(pickVoice(edgeKorean, 'ko')).not.toBe(edgeKorean[0].identifier);
  });
});

describe('pickVoice with the standard voices', () => {
  const android = (id: string) => ({ identifier: id, name: id, language: id.slice(0, 5), quality: 'Enhanced' });

  it('picks the standard Google voice of each language, the one on the device first', () => {
    const voices = ['ko-kr-x-ism-local', 'ko-kr-x-kod-network', 'ko-kr-x-kod-local', 'de-de-x-dea-local', 'de-de-x-deb-network'].map(android);
    expect(pickVoice(voices, 'ko')).toBe('ko-kr-x-kod-local');
    expect(pickVoice(voices, 'de')).toBe('de-de-x-deb-network');
  });

  it('knows the standard voices for English and Spanish', () => {
    const voices = ['en-us-x-iob-local', 'en-us-x-tpd-local', 'es-es-x-eea-local', 'es-es-x-eff-local'].map(android);
    expect(pickVoice(voices, 'en')).toBe('en-us-x-tpd-local');
    expect(pickVoice(voices, 'es')).toBe('es-es-x-eff-local');
  });

  it('falls back to a natural voice where the standard one is missing', () => {
    expect(pickVoice(edgeKorean, 'ko')).toBe(edgeKorean[2].identifier); // InJoon, first by name
  });
});

describe('isNaturalVoice', () => {
  it('recognises the natural voices of browsers and phones', () => {
    expect(isNaturalVoice(edgeKorean[1])).toBe(true);
    expect(isNaturalVoice({ identifier: 'Google 한국의', name: 'Google 한국의', language: 'ko-KR', quality: 'Default', localService: false })).toBe(true);
    expect(isNaturalVoice({ identifier: 'ko-kr-x-ism-network', language: 'ko-KR', quality: 'Default' })).toBe(true);
    expect(isNaturalVoice({ identifier: 'x', name: 'Yuna (Premium)', language: 'ko-KR', quality: 'Default', localService: true })).toBe(true);
  });

  it('does not count a robotic desktop voice as natural', () => {
    expect(isNaturalVoice(edgeKorean[0])).toBe(false);
    expect(isNaturalVoice({ identifier: 'ko-kr-x-ism-local', language: 'ko-KR', quality: 'Default' })).toBe(false);
  });
});

describe('voiceName', () => {
  it('shortens the long names of browsers and Android', () => {
    expect(voiceName(edgeKorean[0])).toBe('Heami');
    expect(voiceName(edgeKorean[1])).toBe('SunHi');
    expect(
      voiceName({ identifier: 'x', name: 'Microsoft Hyunsu Multilingual Online (Natural) - Korean (Korea)', language: 'ko-KR', quality: 'Default' }),
    ).toBe('Hyunsu Multilingual');
    expect(voiceName({ identifier: 'ko-kr-x-ism-network', name: 'ko-kr-x-ism-network', language: 'ko-KR', quality: 'Enhanced' })).toBe(
      'Google ISM (online)',
    );
    expect(voiceName({ identifier: 'x', name: 'Yuna (Enhanced)', language: 'ko-KR', quality: 'Enhanced' })).toBe('Yuna');
  });

  it('keeps other names and falls back to the identifier', () => {
    expect(voiceName({ identifier: 'g', name: 'Google 한국의', language: 'ko-KR', quality: 'Default' })).toBe('Google 한국의');
    expect(voiceName({ identifier: 'id-only', name: '', language: 'ko-KR', quality: 'Default' })).toBe('id-only');
  });
});

describe('voiceOptions', () => {
  it('lists natural voices first, by name, and each voice once', () => {
    const options = voiceOptions([...edgeKorean, edgeKorean[1]], 'ko');
    expect(options.map((o) => o.name)).toEqual(['InJoon', 'SunHi', 'Heami']);
    expect(options.map((o) => o.natural)).toEqual([true, true, false]);
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
