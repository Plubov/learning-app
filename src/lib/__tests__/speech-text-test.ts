import { pickKoreanVoice, textForSpeech } from '../speech-text';

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
});
