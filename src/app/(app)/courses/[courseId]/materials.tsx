import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { planCourse, readMaterial } from '@/lib/ai';
import { LIMITS, type SourceRole } from '@/lib/course-content';
import {
  addMaterial,
  addTextMaterial,
  deleteMaterial,
  loadMaterials,
  type Material,
} from '@/lib/study';
import { cleanText } from '@/lib/text';
import { chooseDocuments, choosePhotos, takePhoto, type PickedFile } from '@/lib/uploads';

const ROLES: SourceRole[] = ['material', 'exercises', 'notes'];

const ROLE_LABELS = {
  material: { icon: '📘', label: 'Lecture material' },
  exercises: { icon: '🧮', label: 'Exercises' },
  notes: { icon: '✍️', label: 'My notes' },
} as const;

/** Files read at the same time. More would run into the AI service's rate limit. */
const READ_AT_ONCE = 2;

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * The material of a study course: scans and files the learner uploaded, each
 * read by AI into text. That text is what the course's plan, lessons and
 * exercises are made from.
 *
 * Adding works in two phases, so many files can be added in one go: first
 * everything is uploaded (quick), then the files are read part by part in
 * the background while the screen stays usable. Reading can be interrupted
 * and continued; what has been read is kept.
 */
export default function MaterialsScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const theme = useTheme();
  const [reload, setReload] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null); // progress line while uploading
  const [working, setWorking] = useState<string | null>(null); // deleting or planning
  const [failure, setFailure] = useState<string | null>(null);
  const [reading, setReading] = useState(false); // the reading loop is running
  const [activeIds, setActiveIds] = useState<string[]>([]); // files a part is being read of right now
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null); // id of the material shown in full
  const [added, setAdded] = useState(false); // something new was read in this visit
  const [planned, setPlanned] = useState(false);
  // The form for adding text directly; null = closed.
  const [draft, setDraft] = useState<{ title: string; text: string; role: SourceRole } | null>(null);
  // Set when the screen is left, so the reading loop stops after its current part.
  const left = useRef(false);
  const loopRunning = useRef(false);

  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
    };
  }, []);

  const load = useCallback(
    () =>
      loadMaterials(courseId).then(
        (data) => ({ data, error: null }),
        (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
      ),
    // `reload` is not read inside: changing it re-runs the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseId, reload],
  );
  const { data: materials, error } = useFocusQuery(load);
  const busy = uploading !== null || working !== null;

  /**
   * Reads all unread files, one part per call, a few files at a time. A file
   * whose part fails is skipped for this run and can be continued later.
   */
  async function readAll() {
    if (loopRunning.current) return;
    loopRunning.current = true;
    setReading(true);
    setReadErrors({});
    const failed = new Set<string>();
    try {
      while (!left.current) {
        const all = await loadMaterials(courseId);
        const pending = all.filter((m) => m.text === null && !m.legacy && !failed.has(m.id));
        if (pending.length === 0) break;
        const batch = pending.slice(0, READ_AT_ONCE);
        setActiveIds(batch.map((m) => m.id));
        await Promise.all(
          batch.map(async (material) => {
            try {
              await readMaterial(material.id);
              setAdded(true);
            } catch (reason) {
              failed.add(material.id);
              setReadErrors((errors) => ({ ...errors, [material.id]: message(reason) }));
            }
          }),
        );
        setReload((n) => n + 1);
      }
    } catch (reason) {
      setFailure(message(reason));
    }
    setActiveIds([]);
    setReading(false);
    loopRunning.current = false;
  }

  /** Phase one: upload everything that was picked. Phase two starts by itself. */
  async function add(pick: () => Promise<PickedFile[]>) {
    setFailure(null);
    setUploading('Waiting for your files…');
    let uploaded = 0;
    try {
      const files = await pick();
      for (const [i, file] of files.entries()) {
        const which = files.length > 1 ? `file ${i + 1} of ${files.length}` : `"${file.name}"`;
        setUploading(`Uploading ${which}…`);
        await addMaterial(courseId, file, (part, parts) => {
          if (parts > 1) setUploading(`Uploading ${which}: part ${part} of ${parts}…`);
        });
        uploaded += 1;
        setReload((n) => n + 1);
      }
    } catch (reason) {
      setFailure(message(reason));
    }
    setUploading(null);
    if (uploaded > 0) readAll();
  }

  async function run(label: string, step: () => Promise<void>) {
    setWorking(label);
    setFailure(null);
    try {
      await step();
    } catch (reason) {
      setFailure(message(reason));
    }
    setWorking(null);
    setReload((n) => n + 1);
  }

  const unread = materials?.filter((m) => m.text === null && !m.legacy) ?? [];
  const partsLeft = unread.reduce((sum, m) => sum + (m.paths.length - m.partsRead), 0);

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        Add what your course gives you: script, slides, exercise sheets, and your own handwritten
        notes. Pick as many files as you like; they are uploaded first and then read one after the
        other. Text you already have can be pasted directly.
      </ThemedText>

      <View style={styles.actions}>
        <AddButton
          icon="📷"
          title="Scan a page"
          disabled={busy}
          onPress={() => add(async () => [await takePhoto()].filter((file) => file !== null))}
        />
        <AddButton icon="🖼️" title="Photos" disabled={busy} onPress={() => add(() => choosePhotos(10))} />
        <AddButton icon="📄" title="PDFs" disabled={busy} onPress={() => add(chooseDocuments)} />
        <AddButton
          icon="✏️"
          title="Text"
          disabled={busy}
          onPress={() => setDraft(draft ? null : { title: '', text: '', role: 'material' })}
        />
      </View>

      {draft && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>✏️ Add text</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            For text you already have, such as the script of a lesson or your typed notes. It is
            stored as it is, at once and without AI.
          </ThemedText>
          <TextField
            label="Title (optional)"
            placeholder="e.g. Lecture 3: Lorentz transformations"
            value={draft.title}
            onChangeText={(title) => setDraft({ ...draft, title })}
          />
          <TextField
            label="Text"
            placeholder="Type or paste the text here"
            value={draft.text}
            onChangeText={(text) => setDraft({ ...draft, text })}
            multiline
            autoFocus
            style={styles.textArea}
          />
          <View style={styles.roles}>
            {ROLES.map((role) => (
              <Pressable
                key={role}
                onPress={() => setDraft({ ...draft, role })}
                accessibilityRole="radio"
                accessibilityState={{ selected: draft.role === role }}
                style={[
                  styles.role,
                  {
                    borderColor: draft.role === role ? theme.tint : theme.border,
                    backgroundColor: draft.role === role ? theme.tintSoft : theme.background,
                  },
                ]}>
                <ThemedText type="small">
                  {ROLE_LABELS[role].icon} {ROLE_LABELS[role].label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {cleanText(draft.text).length > LIMITS.material && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              The text is {cleanText(draft.text).length} characters long; at most {LIMITS.material}{' '}
              fit into one entry. Split it into two.
            </ThemedText>
          )}
          <Button
            title="Save text"
            disabled={
              busy || cleanText(draft.text) === '' || cleanText(draft.text).length > LIMITS.material
            }
            onPress={() =>
              run('Saving…', async () => {
                await addTextMaterial(courseId, draft);
                setDraft(null);
                setAdded(true);
              })
            }
          />
          <Button title="Cancel" variant="secondary" onPress={() => setDraft(null)} />
        </ThemedView>
      )}

      {(uploading ?? working) && (
        <ThemedView type="tintSoft" style={styles.note}>
          <ThemedText type="smallBold">⏳ {uploading ?? working}</ThemedText>
        </ThemedView>
      )}
      {(failure ?? error) && (
        <ThemedText style={{ color: theme.danger }}>{failure ?? error}</ThemedText>
      )}

      {unread.length > 0 && (
        <ThemedView type="tintSoft" style={styles.note}>
          <ThemedText type="smallBold">
            {reading
              ? `📖 Reading: ${partsLeft} ${partsLeft === 1 ? 'part' : 'parts'} to go`
              : `${unread.length} ${unread.length === 1 ? 'file is' : 'files are'} not read yet`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {reading
              ? 'About a minute per part. Keep this page open; you can add more files meanwhile. If you leave, what is read so far is kept.'
              : 'Only files that are read are used for lessons and exercises.'}
          </ThemedText>
          {!reading && (
            <Button title="Read them now" onPress={readAll} disabled={uploading !== null} />
          )}
        </ThemedView>
      )}

      {added && !planned && !reading && unread.length === 0 && !busy && (
        <ThemedView type="successSoft" style={styles.note}>
          <ThemedText type="smallBold">✓ Everything is read.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            New lessons and exercises use it from now on. If the course already has a plan, you
            can have the lessons you have not started planned again with it.
          </ThemedText>
          <Button
            title="Update the plan with the new material"
            variant="secondary"
            onPress={() =>
              run('Planning again. This can take a minute or two…', async () => {
                await planCourse(
                  courseId,
                  'New course material was added. Plan the lessons that have not been started again so that they follow the material.',
                );
                setPlanned(true);
              })
            }
          />
        </ThemedView>
      )}

      {materials?.length === 0 && !busy && (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          📭 Nothing here yet. Start with the script or the first exercise sheet.
        </ThemedText>
      )}

      {materials?.map((material) => (
        <MaterialCard
          key={material.id}
          material={material}
          open={open === material.id}
          active={activeIds.includes(material.id)}
          queued={reading && !activeIds.includes(material.id)}
          readError={readErrors[material.id] ?? null}
          // A file is not deleted while a part of it is being read.
          canDelete={!busy && !activeIds.includes(material.id)}
          onToggle={() => setOpen(open === material.id ? null : material.id)}
          onDelete={() => run('Deleting…', () => deleteMaterial(material))}
        />
      ))}
    </Screen>
  );
}

function AddButton({
  icon,
  title,
  onPress,
  disabled,
}: {
  icon: string;
  title: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.add,
        { backgroundColor: theme.backgroundElement, borderColor: theme.tint },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <ThemedText style={styles.addIcon}>{icon}</ThemedText>
      <ThemedText type="smallBold">{title}</ThemedText>
    </Pressable>
  );
}

function MaterialCard({
  material,
  open,
  active,
  queued,
  readError,
  canDelete,
  onToggle,
  onDelete,
}: {
  material: Material;
  open: boolean;
  /** A part of this file is being read right now. */
  active: boolean;
  /** Reading is running and this file's turn has not come yet. */
  queued: boolean;
  readError: string | null;
  canDelete: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const role = material.role ? ROLE_LABELS[material.role] : null;
  const read = material.text !== null;
  const parts = material.paths.length;

  let status: string;
  if (read) status = `${role?.label ?? 'Material'} · read ✓ · ${open ? 'tap to close' : 'tap to see the text'}`;
  else if (material.legacy) status = 'Uploaded in one piece, which is too long to read. Delete it and add it again.';
  else if (active) status = `Reading part ${material.partsRead + 1} of ${parts}…`;
  else if (material.partsRead > 0) status = `${material.partsRead} of ${parts} parts read${queued ? ' · waiting' : ''}`;
  else status = queued ? 'Uploaded · waiting to be read' : 'Uploaded · not read yet';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable onPress={onToggle} accessibilityRole="button" style={styles.cardHead}>
        <ThemedText style={styles.cardIcon}>
          {read ? (role?.icon ?? '📘') : active ? '📖' : material.legacy ? '⚠️' : '⏳'}
        </ThemedText>
        <View style={styles.grow}>
          <ThemedText style={styles.cardTitle} numberOfLines={2}>
            {material.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {status}
          </ThemedText>
        </View>
      </Pressable>
      {!read && !material.legacy && parts > 1 && <ProgressBar value={material.partsRead / parts} />}
      {readError && (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {readError} What is read so far is kept; use “Read them now” to continue.
        </ThemedText>
      )}
      {open && material.text !== null && (
        <ThemedText type="small" selectable>
          {material.text}
        </ThemedText>
      )}
      {(open || material.legacy) && (
        <Button title="Delete this file" variant="secondary" onPress={onDelete} disabled={!canDelete} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  dimmed: { opacity: 0.6 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  textArea: { minHeight: 180, maxHeight: 360 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  role: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 2,
  },
  add: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  addIcon: { fontSize: 28, lineHeight: 36 },
  note: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.three },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cardIcon: { fontSize: 28, lineHeight: 36 },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: 700 },
});
