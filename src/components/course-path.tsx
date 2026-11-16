import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useNativeDriver } from '@/components/session/motion';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { stars, stopOffset, stopState, trailDots, type StopState } from '@/lib/course-path';
import type { CourseLesson } from '@/lib/courses';
import type { Stage } from '@/lib/course-content';
import { useT } from '@/lib/i18n';

/** Height of one stop's row; the trail dots are placed from it. */
const ROW = 112;
/** Pixels per step of sideways offset. */
const STEP = 34;
const STOP = 68;
const CURRENT_STOP = 80;

type Props = {
  stages: Stage[];
  lessons: CourseLesson[];
  /** The next lesson to do; null when all are done. */
  nextId: string | null;
  onOpen: (lesson: CourseLesson) => void;
};

/**
 * The course as a path: every lesson is a round stop on a winding trail,
 * every stage a signpost along the way, and the goal waits at the end.
 * Finished stops are green with stars, the next one is large and pulses.
 */
export function CoursePath({ stages, lessons, nextId, onOpen }: Props) {
  const theme = useTheme();
  const { t } = useT();
  const lastStage = stages.length - 1;
  // A lesson kept from an older plan may point past the end of a shorter
  // new roadmap; it is then shown in the last stage.
  const byStage = stages.map((_, stageIndex) =>
    lessons.filter((l) => Math.min(l.stage, lastStage) === stageIndex),
  );
  // Position on the trail of each stage's first stop, counted across stages.
  const firstIndex = byStage.map((_, stageIndex) =>
    byStage.slice(0, stageIndex).reduce((count, group) => count + group.length, 0),
  );

  return (
    <View>
      {stages.map((stage, stageIndex) => {
        const inStage = byStage[stageIndex];
        const doneInStage = inStage.filter((l) => l.completed).length;
        const stageDone = inStage.length > 0 && doneInStage === inStage.length;
        return (
          <View key={stageIndex}>
            <ThemedView
              type={stageDone ? 'successSoft' : 'tintSoft'}
              style={[styles.signpost, { borderColor: stageDone ? theme.success : theme.tint }]}>
              <View style={styles.spread}>
                <ThemedText
                  type="smallBold"
                  style={[styles.caps, { color: stageDone ? theme.success : theme.tint }]}>
                  {stageDone ? '✓ ' : ''}
                  {t('path.stage', { n: stageIndex + 1 })}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {doneInStage} / {inStage.length}
                </ThemedText>
              </View>
              <ThemedText style={styles.signTitle}>{stage.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {stage.outcome}
              </ThemedText>
            </ThemedView>

            {inStage.map((lesson, indexInStage) => {
              const index = firstIndex[stageIndex] + indexInStage;
              const offset = stopOffset(index);
              const last = index === lessons.length - 1;
              return (
                <Stop
                  key={lesson.id}
                  lesson={lesson}
                  state={stopState(lesson, nextId)}
                  offset={offset}
                  // The trail leads on to the next stop, or straight down to the goal.
                  nextOffset={last ? 0 : stopOffset(index + 1)}
                  // A signpost follows the last stop of a stage; the trail
                  // pauses there instead of running across it.
                  trail={last || indexInStage < inStage.length - 1}
                  onPress={() => onOpen(lesson)}
                />
              );
            })}
          </View>
        );
      })}

      <View style={styles.goal}>
        <ThemedText style={styles.goalIcon}>{nextId === null ? '🏆' : '🏁'}</ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {nextId === null ? t('path.complete') : t('path.goal')}
        </ThemedText>
      </View>
    </View>
  );
}

function Stop({
  lesson,
  state,
  offset,
  nextOffset,
  trail,
  onPress,
}: {
  lesson: CourseLesson;
  state: StopState;
  offset: number;
  nextOffset: number;
  trail: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useT();
  const current = state === 'current';
  const size = current ? CURRENT_STOP : STOP;

  // The next stop breathes, so the eye lands on it first.
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!current) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [current, pulse]);

  const colors = {
    done: { backgroundColor: theme.success, borderColor: theme.success },
    current: { backgroundColor: theme.tint, borderColor: theme.tint },
    open: { backgroundColor: theme.tintSoft, borderColor: theme.tint },
    ahead: { backgroundColor: theme.backgroundElement, borderColor: theme.border },
  }[state];
  const icon = { done: '✓', current: '▶', open: '…', ahead: String(lesson.position) }[state];
  const onColor = state === 'done' || current;
  let status = '';
  if (state === 'done') status = '⭐'.repeat(stars(lesson.proficiency));
  else if (current) {
    status = t(lesson.learned ? 'path.practiseNext' : lesson.started ? 'path.continueHere' : 'path.startHere');
  } else if (state === 'open') status = t(lesson.learned ? 'path.learned' : 'path.started');

  // The label goes on the side with more room.
  const labelOnRight = offset <= 0;
  const gap = size / 2 + Spacing.three;
  return (
    <View style={styles.row}>
      {(trail ? trailDots(offset, nextOffset) : []).map((dot, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: state === 'done' ? theme.success : theme.border,
              top: ROW / 2 + dot.y * ROW - 4,
              marginLeft: dot.x * STEP - 4,
            },
          ]}
        />
      ))}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${t('common.lessonTitle', { n: lesson.position, title: lesson.title })}. ${status}`}
        style={({ pressed }) => [{ transform: [{ translateX: offset * STEP }] }, pressed && styles.pressed]}>
        {current && (
          <Animated.View
            style={[
              styles.ring,
              {
                width: size + 20,
                height: size + 20,
                borderRadius: (size + 20) / 2,
                borderColor: theme.tint,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) }],
              },
            ]}
          />
        )}
        <View style={[styles.stop, colors, { width: size, height: size, borderRadius: size / 2 }]}>
          <ThemedText
            style={[current ? styles.stopIconLarge : styles.stopIcon, onColor && styles.onColor]}
            themeColor={state === 'ahead' ? 'textSecondary' : 'text'}>
            {icon}
          </ThemedText>
        </View>
      </Pressable>

      <Pressable
        onPress={onPress}
        accessible={false}
        style={[
          styles.label,
          labelOnRight
            ? { left: '50%', right: 0, marginLeft: offset * STEP + gap }
            : { right: '50%', left: 0, marginRight: -offset * STEP + gap, alignItems: 'flex-end' },
        ]}>
        <ThemedText
          type={current ? 'smallBold' : 'small'}
          themeColor={state === 'ahead' ? 'textSecondary' : 'text'}
          numberOfLines={2}
          style={!labelOnRight && styles.right}>
          {lesson.title}
        </ThemedText>
        {status !== '' && (
          <ThemedText
            type="small"
            style={[!labelOnRight && styles.right, current && { color: theme.tint }]}
            themeColor="textSecondary">
            {status}
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  caps: { textTransform: 'uppercase', letterSpacing: 0.6 },
  signpost: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderLeftWidth: 6,
    gap: Spacing.one,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  signTitle: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', left: '50%', width: 8, height: 8, borderRadius: 4 },
  ring: { position: 'absolute', top: -10, left: -10, borderWidth: 4 },
  stop: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    // A thicker lower edge makes the stop look raised, like a button.
    borderBottomWidth: 6,
  },
  stopIcon: { fontSize: 22, lineHeight: 28, fontWeight: 700 },
  stopIconLarge: { fontSize: 28, lineHeight: 34, fontWeight: 700 },
  onColor: { color: '#ffffff' },
  pressed: { opacity: 0.75 },
  label: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  right: { textAlign: 'right' },
  goal: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.three },
  goalIcon: { fontSize: 44, lineHeight: 56 },
});
