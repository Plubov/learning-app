import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Appear } from '@/components/session/motion';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

type Props = {
  correct: boolean;
  /** "Correct!", "Nice!", ... or the line for a wrong answer. */
  title: string;
  /** The right answer, shown after a wrong one. */
  answer?: string;
  explanation?: string;
  buttonTitle: string;
  onContinue: () => void;
};

/**
 * What the learner sees right after answering: a green or red panel that
 * rises from the bottom with the verdict, the right answer if needed, a
 * short explanation and the button to go on.
 */
export function FeedbackBar({ correct, title, answer, explanation, buttonTitle, onContinue }: Props) {
  const theme = useTheme();
  const { t } = useT();
  const color = correct ? theme.success : theme.danger;
  return (
    <Appear>
      <View
        style={[styles.panel, { backgroundColor: correct ? theme.successSoft : theme.dangerSoft }]}
        accessibilityLiveRegion="polite">
        <ThemedText style={[styles.title, { color }]}>
          {correct ? '✓ ' : '✕ '}
          {title}
        </ThemedText>
        {answer !== undefined && (
          <ThemedText>
            <ThemedText type="smallBold" style={{ color }}>
              {t('feedback.answer')}{' '}
            </ThemedText>
            {answer}
          </ThemedText>
        )}
        {explanation !== undefined && explanation !== '' && (
          <ThemedText type="small" themeColor="textSecondary">
            {explanation}
          </ThemedText>
        )}
        <Button title={buttonTitle} tone={correct ? 'success' : 'danger'} onPress={onContinue} />
      </View>
    </Appear>
  );
}

const styles = StyleSheet.create({
  panel: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  title: { fontSize: 20, lineHeight: 28, fontWeight: 700 },
});
