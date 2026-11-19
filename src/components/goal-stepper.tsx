import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, MAX_WEEKLY_MINUTES, stepGoal } from '@/lib/focus';
import { useT } from '@/lib/i18n';

const MINUTE = 60_000;

/** The weekly goal of a project with − and + (30-minute steps); below 30 minutes means no goal. */
export function GoalStepper({
  minutes,
  onChange,
}: {
  minutes: number | null;
  onChange: (minutes: number | null) => void;
}) {
  const { t } = useT();
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <StepButton
        label="−"
        accessibilityLabel={t('project.lowerGoal')}
        disabled={minutes === null}
        onPress={() => onChange(stepGoal(minutes, -1))}
      />
      <View style={styles.middle}>
        <ThemedText style={styles.value}>
          {minutes === null ? t('project.noGoal') : t('project.perWeek', { time: formatDuration(minutes * MINUTE) })}
        </ThemedText>
        {minutes !== null && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('project.perDay', { time: formatDuration(Math.ceil(minutes / 7) * MINUTE) })}
          </ThemedText>
        )}
      </View>
      <StepButton
        label="+"
        accessibilityLabel={t('project.raiseGoal')}
        disabled={minutes !== null && minutes >= MAX_WEEKLY_MINUTES}
        onPress={() => onChange(stepGoal(minutes, 1))}
      />
    </ThemedView>
  );
}

function StepButton(props: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      style={({ pressed }) => [
        styles.step,
        { borderColor: theme.border },
        (props.disabled || pressed) && styles.dimmed,
      ]}>
      <ThemedText style={styles.stepLabel}>{props.label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  middle: { alignItems: 'center', flex: 1 },
  value: { fontSize: 22, lineHeight: 30, fontWeight: 700 },
  step: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontSize: 24, lineHeight: 28 },
  dimmed: { opacity: 0.4 },
});
