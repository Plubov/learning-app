import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Vibration, View } from 'react-native';

import { Button } from '@/components/button';
import { FeedbackBar } from '@/components/session/feedback-bar';
import { Appear } from '@/components/session/motion';
import { OptionCard, type OptionState } from '@/components/session/option-card';
import { SessionLayout } from '@/components/session/session-layout';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSoundSetting } from '@/hooks/use-sound-setting';
import { useTheme } from '@/hooks/use-theme';
import { praise } from '@/lib/exercises';
import { useT, type TextKey } from '@/lib/i18n';
import { speechForPage, type FlowPage } from '@/lib/lesson-flow';
import { playSound } from '@/lib/sounds';
import { speakSegments, stopSpeaking } from '@/lib/speech';

type Props = {
  pages: FlowPage[];
  /** The learner's language; null when unknown (then only the items are read aloud). */
  lang: string | null;
  /** The language being learned; null for other subjects. */
  targetLang: string | null;
  /** Read in the calm voice (study courses) instead of the lively one. */
  calm?: boolean;
  /** Called at the end; `practise` is true when the learner chose to go on to practice. */
  onDone: (practise: boolean) => void;
  onClose: () => void;
};

/**
 * The guided run through a lesson: one page at a time (an introduction step,
 * a new item, a quick check, the recap), read aloud when sound is on.
 * The checks are a warm-up directly after seeing the item; they are not
 * stored, because they say nothing yet about what the learner remembers.
 */
export function LessonFlow({ pages, lang, targetLang, calm, onDone, onClose }: Props) {
  const theme = useTheme();
  const { t } = useT();
  const { sound, toggleSound } = useSoundSetting();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null); // answer to the current check
  const [praiseKey, setPraiseKey] = useState<TextKey>('praise.1');

  const page = pages[index];
  const last = index === pages.length - 1;

  function speak() {
    speakSegments(
      speechForPage(page, lang, targetLang).map((segment) => ({
        ...segment,
        slow: segment.lang === targetLang,
        calm,
      })),
    );
  }

  useEffect(
    () => () => {
      stopSpeaking();
    },
    [],
  );

  useEffect(() => {
    if (sound) speak();
    // Speaks when a new page appears or sound is switched on; `speak` reads
    // only the page at `index`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sound]);

  function go(to: number) {
    stopSpeaking();
    setPicked(null);
    setIndex(Math.max(0, to));
  }

  function pick(option: string) {
    if (page.kind !== 'check') return;
    const correct = option === page.item.meaning;
    setPicked(option);
    setPraiseKey(praise());
    if (sound) playSound(correct ? 'correct' : 'wrong');
    if (!correct) Vibration.vibrate(60);
  }

  const hasSound = speechForPage(page, lang, targetLang).length > 0;

  let footer;
  if (page.kind === 'check') {
    footer =
      picked === null ? null : (
        <FeedbackBar
          correct={picked === page.item.meaning}
          title={t(picked === page.item.meaning ? praiseKey : 'feedback.notQuite')}
          answer={picked === page.item.meaning ? undefined : page.item.meaning}
          buttonTitle={t('common.continue')}
          onContinue={() => go(index + 1)}
        />
      );
  } else if (last) {
    footer = (
      <>
        <Button title={t('flow.startPractising')} tone="success" onPress={() => onDone(true)} />
        <Button title={t('flow.later')} variant="secondary" onPress={() => onDone(false)} />
      </>
    );
  } else {
    footer = (
      <>
        <Button title={t('common.continue')} onPress={() => go(index + 1)} />
        {index > 0 && <Button title={t('common.back')} variant="secondary" onPress={() => go(index - 1)} />}
      </>
    );
  }

  function stateOf(option: string): OptionState {
    if (page.kind !== 'check' || picked === null) return 'idle';
    if (option === page.item.meaning) return 'correct';
    return option === picked ? 'wrong' : 'done';
  }

  return (
    <SessionLayout
      progress={(index + (last ? 1 : 0)) / pages.length}
      sound={sound}
      onToggleSound={toggleSound}
      onClose={onClose}
      footer={footer}>
      <Appear key={index} style={styles.page}>
        {page.kind === 'check' && (
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            {t('flow.quickCheck')}
          </ThemedText>
        )}
        {page.kind === 'item' && (
          <ThemedText type="smallBold" style={[styles.label, { color: theme.tint }]}>
            {t('flow.new')}
          </ThemedText>
        )}

        <ThemedView type="backgroundElement" style={styles.card}>
          {page.kind === 'step' && (
            <>
              {page.step.title && <ThemedText style={styles.stepTitle}>{page.step.title}</ThemedText>}
              <ThemedText style={page.step.title ? styles.stepLine : styles.stepText}>
                {page.step.parts.map((part, i) =>
                  part.target ? (
                    <ThemedText
                      key={i}
                      style={[
                        page.step.title ? styles.stepLine : styles.stepText,
                        styles.target,
                        { color: theme.tint },
                      ]}>
                      {part.text}
                    </ThemedText>
                  ) : (
                    part.text
                  ),
                )}
              </ThemedText>
              {page.step.example && (
                <View
                  style={[
                    styles.example,
                    { backgroundColor: theme.background, borderLeftColor: theme.tint },
                  ]}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                    {t('flow.example')}
                  </ThemedText>
                  <ThemedText style={styles.exampleText}>{page.step.example.text}</ThemedText>
                  {page.step.example.note !== '' && (
                    <ThemedText themeColor="textSecondary">{page.step.example.note}</ThemedText>
                  )}
                </View>
              )}
            </>
          )}

          {page.kind === 'item' && (
            <>
              <ThemedText style={styles.term}>{page.item.term}</ThemedText>
              <ThemedText style={styles.stepText}>{page.item.meaning}</ThemedText>
              {page.item.notes && (
                <ThemedText themeColor="textSecondary">{page.item.notes}</ThemedText>
              )}
            </>
          )}

          {page.kind === 'check' && <ThemedText style={styles.term}>{page.item.term}</ThemedText>}

          {page.kind === 'recap' && (
            <>
              <ThemedText style={styles.recapTitle}>{t('flow.recap')}</ThemedText>
              {page.keyPoints.map((point) => (
                <ThemedText key={point} style={styles.point}>
                  • {point}
                </ThemedText>
              ))}
            </>
          )}

          {hasSound && (
            <Pressable
              onPress={speak}
              accessibilityRole="button"
              accessibilityLabel={t('common.readAloud')}
              hitSlop={Spacing.two}
              style={styles.listen}>
              <ThemedText style={styles.listenIcon}>🔊</ThemedText>
            </Pressable>
          )}
        </ThemedView>

        {page.kind === 'check' && (
          <View style={styles.options}>
            {page.options.map((option) => (
              <OptionCard
                key={option}
                label={option}
                state={stateOf(option)}
                disabled={picked !== null}
                onPress={() => pick(option)}
              />
            ))}
          </View>
        )}
      </Appear>
    </SessionLayout>
  );
}

const styles = StyleSheet.create({
  page: { gap: Spacing.three },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.three,
    minHeight: 200,
    justifyContent: 'center',
  },
  stepText: { fontSize: 22, lineHeight: 32 },
  stepTitle: { fontSize: 26, lineHeight: 34, fontWeight: 700 },
  stepLine: { fontSize: 18, lineHeight: 27 },
  example: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderLeftWidth: 4,
    gap: Spacing.one,
  },
  exampleText: { fontSize: 22, lineHeight: 32, fontWeight: 700 },
  target: { fontWeight: 700 },
  term: { fontSize: 36, lineHeight: 48, fontWeight: 700 },
  recapTitle: { fontSize: 20, lineHeight: 28, fontWeight: 700 },
  point: { fontSize: 17, lineHeight: 26 },
  listen: { alignSelf: 'flex-start' },
  listenIcon: { fontSize: 24, lineHeight: 32 },
  options: { gap: Spacing.two },
});
