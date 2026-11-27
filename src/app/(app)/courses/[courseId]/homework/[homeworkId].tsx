import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Confetti } from '@/components/session/confetti';
import { usePop } from '@/components/session/motion';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useSoundSetting } from '@/hooks/use-sound-setting';
import { useTheme } from '@/hooks/use-theme';
import { gradeAnswer } from '@/lib/ai';
import { playSound } from '@/lib/sounds';
import { deleteHomework, loadHomework, verdictLabel } from '@/lib/study';
import { useT } from '@/lib/i18n';

/**
 * The result of a homework check: the verdict first, then what to fix, then
 * the solution step by step, and at the bottom what the AI read from the
 * photos (so a misread line can be spotted).
 */
export default function HomeworkResultScreen() {
  const { courseId, homeworkId, fresh } = useLocalSearchParams<{
    courseId: string;
    homeworkId: string;
    /** "1" right after the check: the result is celebrated once. */
    fresh?: string;
  }>();
  const theme = useTheme();
  const { t } = useT();
  const { sound } = useSoundSetting();
  const { scale, pop } = usePop();
  const [reload, setReload] = useState(0);
  const [working, setWorking] = useState<'check' | 'delete' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [showRead, setShowRead] = useState(false);

  const load = useCallback(
    () =>
      loadHomework(homeworkId).then(
        (data) => ({ data, error: null }),
        (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
      ),
    // `reload` is not read inside: changing it re-runs the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [homeworkId, reload],
  );
  const { data: homework, error, loading } = useFocusQuery(load);
  const result = homework?.result ?? null;
  const celebrate = fresh === '1' && result?.verdict === 'correct';

  // Sound and a bounce once, when a freshly checked result appears.
  const verdict = result?.verdict;
  useEffect(() => {
    if (fresh !== '1' || !verdict || sound === null) return;
    pop();
    if (!sound) return;
    if (verdict === 'correct') playSound('complete');
    else if (verdict === 'partly' || verdict === 'open') playSound('correct');
    else playSound('wrong');
    // `pop` only starts an animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, verdict, sound]);

  async function run(kind: 'check' | 'delete', action: () => Promise<void>) {
    setWorking(kind);
    setFailure(null);
    try {
      await action();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : String(reason));
    }
    setWorking(null);
  }

  if (!homework) {
    return (
      <Screen>
        {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
        {loading && <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>}
      </Screen>
    );
  }

  const label = result ? verdictLabel(result.verdict) : null;
  const graded = result !== null && result.verdict !== 'open' && result.verdict !== 'unreadable';
  const color = label?.good ? theme.success : theme.danger;

  return (
    <View style={styles.fill}>
      <Screen>
        {result && label ? (
          <ThemedView type={label.good ? 'successSoft' : 'dangerSoft'} style={styles.verdict}>
            <Animated.Text style={[styles.verdictIcon, { transform: [{ scale }] }]}>
              {label.icon}
            </Animated.Text>
            <ThemedText style={[styles.verdictTitle, { color }]}>{t(label.title)}</ThemedText>
            {graded && (
              <ThemedText style={[styles.score, { color }]}>
                {result.score}
                <ThemedText type="small" themeColor="textSecondary">
                  {' '}
                  / 100
                </ThemedText>
              </ThemedText>
            )}
            <ThemedText style={styles.center}>{result.summary}</ThemedText>
          </ThemedView>
        ) : (
          <ThemedView type="tintSoft" style={styles.verdict}>
            <ThemedText style={styles.verdictIcon}>⏳</ThemedText>
            <ThemedText style={styles.verdictTitle}>{t('homework.notChecked')}</ThemedText>
            <ThemedText style={styles.center} themeColor="textSecondary">
              {t('homework.notFinished')}
            </ThemedText>
          </ThemedView>
        )}

        {failure && <ThemedText style={{ color: theme.danger }}>{failure}</ThemedText>}
        {working === 'check' && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('homework.reading')}
          </ThemedText>
        )}
        {!result && (
          <Button
            title={t('homework.checkNow')}
            busy={working === 'check'}
            onPress={() =>
              run('check', async () => {
                await gradeAnswer(homework.id);
                setReload((n) => n + 1);
              })
            }
          />
        )}

        {result && result.hint !== '' && (
          <ThemedView type="tintSoft" style={styles.box}>
            <ThemedText style={styles.boxTitle}>💡 {t(graded ? 'homework.howToFix' : 'homework.nextStep')}</ThemedText>
            <ThemedText selectable>{result.hint}</ThemedText>
          </ThemedView>
        )}

        {homework.task && (
          <ThemedView type="backgroundElement" style={styles.box}>
            <ThemedText style={styles.boxTitle}>📋 {t('homework.taskTitle')}</ThemedText>
            <ThemedText selectable>{homework.task}</ThemedText>
          </ThemedView>
        )}

        {result && result.steps.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{t('homework.steps')}</ThemedText>
            {result.steps.map((step, i) => (
              <ThemedView
                key={i}
                type="backgroundElement"
                style={[styles.step, { borderLeftColor: step.ok ? theme.success : theme.danger }]}>
                <ThemedText selectable>
                  <ThemedText style={{ color: step.ok ? theme.success : theme.danger, fontWeight: 700 }}>
                    {step.ok ? '✓ ' : '✕ '}
                  </ThemedText>
                  {step.text}
                </ThemedText>
                {step.comment !== '' && (
                  <ThemedText type="small" themeColor="textSecondary" selectable>
                    {step.comment}
                  </ThemedText>
                )}
              </ThemedView>
            ))}
          </View>
        )}

        {homework.transcription && (
          <ThemedView type="backgroundElement" style={styles.box}>
            <Pressable onPress={() => setShowRead(!showRead)} accessibilityRole="button">
              <ThemedText style={styles.boxTitle}>
                👓 {homework.pages === 1 ? t('homework.readOne') : t('homework.readMany', { n: homework.pages })}{' '}
                {showRead ? '▾' : '▸'}
              </ThemedText>
            </Pressable>
            {showRead && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('homework.readHint')}
                </ThemedText>
                <ThemedText type="small" selectable>
                  {homework.transcription}
                </ThemedText>
              </>
            )}
          </ThemedView>
        )}

        <Button
          title={t('homework.another')}
          onPress={() => router.replace(`/courses/${courseId}/homework/new`)}
        />
        <Button
          title={t('homework.delete')}
          variant="secondary"
          busy={working === 'delete'}
          onPress={() =>
            run('delete', async () => {
              await deleteHomework(homework.id);
              router.dismissTo(`/courses/${courseId}/homework`);
            })
          }
        />
      </Screen>
      {celebrate && <Confetti />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  verdict: { alignItems: 'center', padding: Spacing.four, borderRadius: Spacing.four, gap: Spacing.two },
  verdictIcon: { fontSize: 64, lineHeight: 80 },
  verdictTitle: { fontSize: 26, lineHeight: 34, fontWeight: 700 },
  score: { fontSize: 40, lineHeight: 48, fontWeight: 700 },
  box: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  boxTitle: { fontSize: 16, lineHeight: 24, fontWeight: 700 },
  section: { gap: Spacing.two },
  sectionTitle: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  step: { padding: Spacing.three, borderRadius: Spacing.two, borderLeftWidth: 5, gap: Spacing.one },
});
