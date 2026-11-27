import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { askTutor, planCourse } from '@/lib/ai';
import { LIMITS } from '@/lib/course-content';
import { supabase } from '@/lib/supabase';
import { cleanText } from '@/lib/text';
import { useT } from '@/lib/i18n';

/** The newest messages shown; older ones stay stored. */
const SHOWN_MESSAGES = 100;

/**
 * Chat with the course's tutor: questions about the subject, and requests to
 * change the plan. The tutor cannot change the plan itself; it proposes the
 * change, and "Update the plan" runs the planner again with that instruction.
 */
export default function CourseChatScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const theme = useTheme();
  const { t } = useT();
  const [reload, setReload] = useState(0);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null); // sent, reply not here yet
  const [applying, setApplying] = useState<string | null>(null); // id of the message being applied
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async () => {
      const [stored, course] = await Promise.all([
        supabase
          .from('course_messages')
          .select('id, role, content, plan_change, created_at')
          .eq('course_id', courseId)
          .order('created_at', { ascending: false })
          .limit(SHOWN_MESSAGES),
        supabase.from('courses').select('planned_at').eq('id', courseId).maybeSingle(),
      ]);
      const failed = stored.error ?? course.error;
      return {
        data:
          stored.data && !failed
            ? { messages: [...stored.data].reverse(), plannedAt: course.data?.planned_at ?? null }
            : null,
        error: failed,
      };
    },
    // `reload` is not read inside: changing it re-runs the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseId, reload],
  );
  const { data: chat, error: loadError } = useFocusQuery(load);
  const messages = chat?.messages;
  // A suggestion older than the current plan has been applied (or replaced by
  // a later one), so its button is not offered again: every press plans the
  // whole course anew.
  const plannedAt = chat?.plannedAt ? Date.parse(chat.plannedAt) : null;

  async function send() {
    const message = cleanText(text);
    if (message === '' || pending !== null) return;
    setPending(message);
    setText('');
    setError(null);
    try {
      await askTutor(courseId, message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setText(message); // nothing typed is lost
    }
    setPending(null);
    setReload((n) => n + 1);
  }

  async function applyPlanChange(messageId: string, instructions: string) {
    setApplying(messageId);
    setError(null);
    try {
      await planCourse(courseId, instructions);
      setApplied(messageId);
      setReload((n) => n + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
    setApplying(null);
  }

  // The question just sent is shown at once; the stored copy replaces it
  // after the reload.
  const lastStored = messages?.[messages.length - 1];
  const showPending =
    pending !== null && !(lastStored?.role === 'user' && lastStored.content === pending);
  const tooLong = cleanText(text).length > LIMITS.chatMessage;

  return (
    <Screen>
      {loadError && <ThemedText style={{ color: theme.danger }}>{loadError}</ThemedText>}
      {messages?.length === 0 && pending === null && (
        <ThemedText themeColor="textSecondary">
          {t('chat.empty')}
        </ThemedText>
      )}

      {messages?.map((message) => (
        <View key={message.id} style={message.role === 'user' ? styles.mine : styles.theirs}>
          <ThemedView
            type={message.role === 'user' ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.bubble}>
            <ThemedText>{message.content}</ThemedText>
          </ThemedView>
          {message.plan_change !== null &&
            (applied === message.id ||
            (plannedAt !== null && Date.parse(message.created_at) < plannedAt) ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('chat.updated')}
              </ThemedText>
            ) : (
              <Button
                title={t('chat.update')}
                onPress={() => applyPlanChange(message.id, message.plan_change ?? '')}
                busy={applying === message.id}
                disabled={applying !== null}
              />
            ))}
        </View>
      ))}
      {showPending && (
        <View style={styles.mine}>
          <ThemedView type="backgroundSelected" style={styles.bubble}>
            <ThemedText>{pending}</ThemedText>
          </ThemedView>
        </View>
      )}
      {pending !== null && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('chat.writing')}
        </ThemedText>
      )}
      {applying !== null && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('chat.replanning')}
        </ThemedText>
      )}

      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
      {tooLong && (
        <ThemedText style={{ color: theme.danger }}>
          {t('chat.tooLong', { max: LIMITS.chatMessage })}
        </ThemedText>
      )}
      <TextField
        placeholder={t('chat.placeholder')}
        value={text}
        onChangeText={setText}
        multiline
        editable={pending === null}
      />
      <Button
        title={t('chat.send')}
        onPress={send}
        busy={pending !== null}
        disabled={cleanText(text) === '' || tooLong}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  mine: { alignItems: 'flex-end', gap: Spacing.two },
  theirs: { alignItems: 'flex-start', gap: Spacing.two },
  bubble: { padding: Spacing.three, borderRadius: Spacing.three, maxWidth: '90%' },
});
