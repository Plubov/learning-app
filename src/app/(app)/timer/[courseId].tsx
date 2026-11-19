import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Vibration, View } from 'react-native';

import { Button } from '@/components/button';
import { GoalCelebration } from '@/components/goal-celebration';
import { ProgressBar } from '@/components/progress-bar';
import { Confetti } from '@/components/session/confetti';
import { usePop } from '@/components/session/motion';
import { SessionLayout } from '@/components/session/session-layout';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusTimer } from '@/hooks/use-focus-timer';
import { useSoundSetting } from '@/hooks/use-sound-setting';
import { useTheme } from '@/hooks/use-theme';
import {
  formatClock,
  formatDuration,
  milestonePassed,
  reached,
  share,
  todayGoalMs,
} from '@/lib/focus';
import { loadFocusProject, type FocusProject } from '@/lib/focus-data';
import { useT } from '@/lib/i18n';
import { playSound } from '@/lib/sounds';
import { toIsoDate } from '@/lib/streak';

const MINUTE = 60_000;

type Celebration = { icon: string; title: string; detail: string; big: boolean };

/**
 * The running focus timer for one course or project, as a full-screen
 * session. It counts up from zero and pauses whenever the learner leaves
 * this screen or the app (see useFocusTimer). Reaching today's goal, the
 * week's goal and every 25 minutes of a session are celebrated; "Finish"
 * ends with a short summary.
 */
export default function TimerScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { t } = useT();
  const theme = useTheme();
  const { sound, toggleSound } = useSoundSetting();
  const [project, setProject] = useState<FocusProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const endCelebration = useCallback(() => setCelebration(null), []);
  const { scale, pop } = usePop();

  useEffect(() => {
    loadFocusProject(courseId).then(setProject, (reason: unknown) =>
      setLoadError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, [courseId]);

  const timer = useFocusTimer(courseId, project !== null);

  // Totals as they were when the timer opened, plus this session.
  const baseToday = project?.todayMs ?? 0;
  const baseWeek = project?.weekMs ?? 0;
  const todayMs = baseToday + timer.sessionMs;
  const weekMs = baseWeek + timer.sessionMs;
  const goalToday = project
    ? todayGoalMs(project.weeklyMinutes, baseWeek - baseToday, toIsoDate(new Date()))
    : null;
  const weekGoal = project?.weeklyMinutes == null ? null : project.weeklyMinutes * MINUTE;

  // Celebrations: compare with the values at the previous tick.
  const previous = useRef<{ session: number; today: number; week: number } | null>(null);
  useEffect(() => {
    if (!project) return;
    const before = previous.current ?? { session: 0, today: baseToday, week: baseWeek };
    previous.current = { session: timer.sessionMs, today: todayMs, week: weekMs };
    const name = project.title;
    let next: Celebration | null = null;
    if (reached(before.week, weekMs, weekGoal)) {
      next = {
        icon: '🏆',
        title: t('timer.weekReached'),
        detail: t('timer.reachedDetail', { time: formatDuration(weekMs), project: name }),
        big: true,
      };
    } else if (reached(before.today, todayMs, goalToday)) {
      next = {
        icon: '🎯',
        title: t('timer.todayReached'),
        detail: t('timer.reachedDetail', { time: formatDuration(todayMs), project: name }),
        big: true,
      };
    } else {
      const milestone = milestonePassed(before.session, timer.sessionMs);
      if (milestone !== null) {
        next = {
          icon: '🔥',
          title: t('timer.milestone', { time: formatDuration(milestone) }),
          detail: t('timer.milestoneDetail'),
          big: false,
        };
      }
    }
    if (next) {
      setCelebration(next);
      if (sound) playSound(next.big ? 'complete' : 'correct');
    }
    // Runs once per tick of the session time; the other values follow from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.sessionMs, project]);

  function finish() {
    timer.stop();
    if (sound) playSound('complete');
    Vibration.vibrate([0, 60, 80, 60]);
    pop();
  }

  function close() {
    timer.stop();
    router.back();
  }

  if (!project) {
    return (
      <SessionLayout progress={0} sound={sound} onToggleSound={toggleSound} onClose={() => router.back()}>
        {loadError ? (
          <ThemedText style={{ color: theme.danger }}>{loadError}</ThemedText>
        ) : (
          <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>
        )}
      </SessionLayout>
    );
  }

  const progress = goalToday ? share(todayMs, goalToday) : share(weekMs, weekGoal);
  const totals = (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">
        {goalToday
          ? t('focus.today', { done: formatDuration(todayMs), goal: formatDuration(goalToday) })
          : t('focus.todayDone', { done: formatDuration(todayMs) })}
      </ThemedText>
      {goalToday ? <ProgressBar value={share(todayMs, goalToday)} /> : null}
      <ThemedText type="small" themeColor="textSecondary">
        {weekGoal !== null
          ? t('focus.week', { done: formatDuration(weekMs), goal: formatDuration(weekGoal) })
          : t('focus.weekDone', { done: formatDuration(weekMs) })}
      </ThemedText>
      {weekGoal !== null && <ProgressBar value={share(weekMs, weekGoal)} />}
    </ThemedView>
  );

  if (timer.stopped) {
    return (
      <View style={styles.fill}>
        <SessionLayout
          progress={progress}
          sound={sound}
          onToggleSound={toggleSound}
          onClose={() => router.back()}
          footer={<Button title={t('timer.done')} tone="success" onPress={() => router.back()} />}>
          <View style={styles.result}>
            <Animated.Text style={[styles.trophy, { transform: [{ scale }] }]}>🎉</Animated.Text>
            <ThemedText type="subtitle" style={styles.center}>
              {t('timer.doneTitle')}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {t('timer.doneText', { time: formatDuration(timer.sessionMs), project: project.title })}
            </ThemedText>
          </View>
          {totals}
          {timer.saveError && <SaveError message={timer.saveError} onRetry={timer.retrySave} />}
        </SessionLayout>
        {timer.sessionMs >= MINUTE && <Confetti />}
      </View>
    );
  }

  let status = t('timer.focusing');
  if (timer.paused) status = t('timer.paused');
  else if (timer.onAllowedSite) status = t('timer.onSite', { site: timer.onAllowedSite });

  return (
    <View style={styles.fill}>
      <SessionLayout
        progress={progress}
        sound={sound}
        onToggleSound={toggleSound}
        onClose={close}
        footer={
          <>
            <Button title={t('timer.finish')} tone="success" onPress={finish} />
            <Button
              title={timer.paused ? t('timer.continue') : t('timer.pause')}
              variant="secondary"
              onPress={timer.togglePause}
            />
          </>
        }>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label} numberOfLines={1}>
          {project.title}
        </ThemedText>

        <View style={styles.clockBox}>
          <ThemedText
            style={[styles.clock, { color: timer.paused ? theme.textSecondary : theme.text }]}
            accessibilityRole="timer">
            {formatClock(timer.sessionMs)}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{t('timer.session')}</ThemedText>
          <ThemedText type="smallBold" style={{ color: timer.paused ? theme.textSecondary : theme.tint }}>
            {timer.counting && !timer.onAllowedSite ? '● ' : ''}
            {status}
          </ThemedText>
        </View>

        {timer.awayMs !== null && timer.awayMs >= 1000 && (
          <Pressable onPress={timer.dismissAwayNote} accessibilityRole="button">
            <ThemedView type="tintSoft" style={styles.note}>
              <ThemedText type="small">
                {t('timer.welcomeBack', { time: formatClock(timer.awayMs) })}
              </ThemedText>
            </ThemedView>
          </Pressable>
        )}

        {totals}

        {project.links.length > 0 && (
          <View style={styles.links}>
            <ThemedText type="smallBold">{t('timer.allowed')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('timer.allowedHint')}
            </ThemedText>
            <View style={styles.chips}>
              {project.links.map((link) => (
                <Pressable
                  key={link.url}
                  accessibilityRole="link"
                  disabled={timer.paused}
                  onPress={() => timer.openAllowed(link.url, link.label)}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: theme.tint, backgroundColor: theme.tintSoft },
                    (pressed || timer.paused) && styles.pressed,
                  ]}>
                  <ThemedText type="small" numberOfLines={1}>
                    {link.label} ↗
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {timer.saveError && <SaveError message={timer.saveError} onRetry={timer.retrySave} />}
      </SessionLayout>
      {celebration && (
        <GoalCelebration
          streak={null}
          icon={celebration.icon}
          title={celebration.title}
          detail={celebration.detail}
          onDone={endCelebration}
        />
      )}
      {celebration?.big && <Confetti />}
    </View>
  );
}

function SaveError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useT();
  const theme = useTheme();
  return (
    <View style={styles.links}>
      <ThemedText type="small" style={{ color: theme.danger }}>
        {t('timer.saveError', { message })}
      </ThemedText>
      <Button title={t('timer.retry')} variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  clockBox: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.four },
  clock: { fontSize: 72, lineHeight: 84, fontWeight: 700, fontVariant: ['tabular-nums'] },
  note: { padding: Spacing.three, borderRadius: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  links: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    maxWidth: '100%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 2,
  },
  pressed: { opacity: 0.6 },
  result: { alignItems: 'center', gap: Spacing.three },
  trophy: { fontSize: 88, lineHeight: 104 },
  center: { textAlign: 'center' },
});
