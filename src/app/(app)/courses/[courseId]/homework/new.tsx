import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { gradeAnswer } from '@/lib/ai';
import { LIMITS, type HomeworkMode } from '@/lib/course-content';
import { createHomework } from '@/lib/study';
import { cleanText } from '@/lib/text';
import { choosePhotos, takePhoto, type PickedFile } from '@/lib/uploads';

/**
 * A new homework check, in three numbered steps on one page: the task, the
 * photos of the solution, and what the learner wants (a check or a hint).
 */
export default function NewHomeworkScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const theme = useTheme();
  const [task, setTask] = useState('');
  const [taskPhoto, setTaskPhoto] = useState<PickedFile | null>(null);
  const [pages, setPages] = useState<PickedFile[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once the homework is saved, so "Try again" checks it instead of
  // uploading everything a second time.
  const [homeworkId, setHomeworkId] = useState<string | null>(null);

  const busy = status !== null;
  const locked = busy || homeworkId !== null;
  const hasTask = cleanText(task) !== '' || taskPhoto !== null;
  const room = LIMITS.solutionPages - pages.length;

  async function pick(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function submit(mode: HomeworkMode) {
    setError(null);
    try {
      let id = homeworkId;
      if (!id) {
        setStatus('Uploading your photos…');
        id = await createHomework(courseId, { task, taskPhoto, pages, mode });
        setHomeworkId(id);
      }
      setStatus(
        mode === 'check'
          ? 'Reading your solution and checking every step. This takes up to a minute…'
          : 'Reading your solution and thinking about a hint…',
      );
      await gradeAnswer(id);
      // Replace, so "back" from the result goes to the list, not to this form.
      router.replace(`/courses/${courseId}/homework/${id}?fresh=1`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus(null);
    }
  }

  return (
    <Screen>
      <Step number={1} title="The task">
        <TextField
          placeholder="Type or paste the task, or photograph it below"
          value={task}
          onChangeText={setTask}
          editable={!locked}
          multiline
          style={styles.taskField}
        />
        {taskPhoto ? (
          <View style={styles.thumbRow}>
            <Thumbnail file={taskPhoto} onRemove={locked ? undefined : () => setTaskPhoto(null)} />
          </View>
        ) : (
          <Button
            title="📷 Photograph the task"
            variant="secondary"
            disabled={locked}
            onPress={() =>
              pick(async () => {
                const photo = await takePhoto();
                if (photo) setTaskPhoto(photo);
              })
            }
          />
        )}
      </Step>

      <Step number={2} title="Your solution">
        <ThemedText type="small" themeColor="textSecondary">
          One page per photo, straight from above, in good light. Up to {LIMITS.solutionPages}{' '}
          pages, in order.
        </ThemedText>
        {pages.length > 0 && (
          <View style={styles.thumbRow}>
            {pages.map((page, i) => (
              <Thumbnail
                key={page.uri}
                file={page}
                label={`Page ${i + 1}`}
                onRemove={locked ? undefined : () => setPages(pages.filter((other) => other !== page))}
              />
            ))}
          </View>
        )}
        <View style={styles.pair}>
          <View style={styles.grow}>
            <Button
              title="📷 Scan a page"
              variant={pages.length === 0 ? 'primary' : 'secondary'}
              disabled={locked || room <= 0}
              onPress={() =>
                pick(async () => {
                  const photo = await takePhoto();
                  if (photo) setPages([...pages, photo]);
                })
              }
            />
          </View>
          <View style={styles.grow}>
            <Button
              title="🖼️ From photos"
              variant="secondary"
              disabled={locked || room <= 0}
              onPress={() =>
                pick(async () => {
                  const chosen = await choosePhotos(room);
                  setPages([...pages, ...chosen].slice(0, LIMITS.solutionPages));
                })
              }
            />
          </View>
        </View>
      </Step>

      <Step number={3} title="What do you need?">
        {status && (
          <ThemedView type="tintSoft" style={styles.note}>
            <ThemedText type="smallBold">⏳ {status}</ThemedText>
          </ThemedView>
        )}
        {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}
        {!hasTask || pages.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Add the task and at least one page of your solution first.
          </ThemedText>
        ) : (
          <>
            <Button
              title={homeworkId ? 'Try again' : '✅ Check my solution'}
              tone="success"
              onPress={() => submit('check')}
              busy={busy}
            />
            {!homeworkId && (
              <Button
                title="💡 I am stuck: give me a hint"
                variant="secondary"
                onPress={() => submit('hint')}
                disabled={busy}
              />
            )}
          </>
        )}
      </Step>
    </Screen>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.step}>
      <View style={styles.stepHead}>
        <View style={[styles.badge, { backgroundColor: theme.tint }]}>
          <ThemedText style={styles.badgeText}>{number}</ThemedText>
        </View>
        <ThemedText style={styles.stepTitle}>{title}</ThemedText>
      </View>
      {children}
    </ThemedView>
  );
}

function Thumbnail({
  file,
  label,
  onRemove,
}: {
  file: PickedFile;
  label?: string;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.thumb}>
      <Image source={{ uri: file.uri }} style={styles.thumbImage} contentFit="cover" />
      {label && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {label}
        </ThemedText>
      )}
      {onRemove && (
        <Pressable onPress={onRemove} accessibilityRole="button" hitSlop={Spacing.two}>
          <ThemedText type="small" themeColor="textSecondary" style={[styles.center, styles.underlined]}>
            Remove
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  center: { textAlign: 'center' },
  underlined: { textDecorationLine: 'underline' },
  step: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.three },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#ffffff', fontWeight: 700, fontSize: 15, lineHeight: 20 },
  stepTitle: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  taskField: { minHeight: 90 },
  pair: { flexDirection: 'row', gap: Spacing.two },
  note: { padding: Spacing.three, borderRadius: Spacing.three },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  thumb: { width: 96, gap: Spacing.one },
  thumbImage: { width: 96, height: 128, borderRadius: Spacing.two },
});
