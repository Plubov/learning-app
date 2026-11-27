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
import { useT } from '@/lib/i18n';
import type { TextKey } from '@/lib/i18n/en';

const ROLES: SourceRole[] = ['material', 'exercises', 'notes'];

const ROLE_LABELS: Record<SourceRole, { icon: string; label: TextKey }> = {
  material: { icon: '📘', label: 'mat.role.material' },
  exercises: { icon: '🧮', label: 'mat.role.exercises' },
  notes: { icon: '✍️', label: 'mat.role.notes' },
};

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
  const { t } = useT();
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
    setUploading(t('mat.waitingFiles'));
    let uploaded = 0;
    try {
      const files = await pick();
      for (const [i, file] of files.entries()) {
        const which = files.length > 1 ? t('mat.fileOf', { i: i + 1, n: files.length }) : `"${file.name}"`;
        setUploading(t('mat.uploading', { which }));
        await addMaterial(courseId, file, (part, parts) => {
          if (parts > 1) setUploading(t('mat.uploadingPart', { which, part, parts }));
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
        {t('mat.intro')}
      </ThemedText>

      <View style={styles.actions}>
        <AddButton
          icon="📷"
          title={t('mat.scan')}
          disabled={busy}
          onPress={() => add(async () => [await takePhoto()].filter((file) => file !== null))}
        />
        <AddButton icon="🖼️" title={t('mat.photos')} disabled={busy} onPress={() => add(() => choosePhotos(10))} />
        <AddButton icon="📄" title={t('mat.pdfs')} disabled={busy} onPress={() => add(chooseDocuments)} />
        <AddButton
          icon="✏️"
          title={t('mat.text')}
          disabled={busy}
          onPress={() => setDraft(draft ? null : { title: '', text: '', role: 'material' })}
        />
      </View>

      {draft && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>{t('mat.addText')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('mat.addTextHint')}
          </ThemedText>
          <TextField
            label={t('mat.titleOptional')}
            placeholder={t('mat.titleExample')}
            value={draft.title}
            onChangeText={(title) => setDraft({ ...draft, title })}
          />
          <TextField
            label={t('mat.text')}
            placeholder={t('mat.textPlaceholder')}
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
                  {ROLE_LABELS[role].icon} {t(ROLE_LABELS[role].label)}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {cleanText(draft.text).length > LIMITS.material && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {t('mat.textTooLong', { n: cleanText(draft.text).length, max: LIMITS.material })}
            </ThemedText>
          )}
          <Button
            title={t('mat.save')}
            disabled={
              busy || cleanText(draft.text) === '' || cleanText(draft.text).length > LIMITS.material
            }
            onPress={() =>
              run(t('mat.saving'), async () => {
                await addTextMaterial(courseId, draft);
                setDraft(null);
                setAdded(true);
              })
            }
          />
          <Button title={t('mat.cancel')} variant="secondary" onPress={() => setDraft(null)} />
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
              ? partsLeft === 1
                ? t('mat.reading1')
                : t('mat.reading', { n: partsLeft })
              : unread.length === 1
                ? t('mat.unread1')
                : t('mat.unread', { n: unread.length })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {reading
              ? t('mat.readingHint')
              : t('mat.onlyRead')}
          </ThemedText>
          {!reading && (
            <Button title={t('mat.readNow')} onPress={readAll} disabled={uploading !== null} />
          )}
        </ThemedView>
      )}

      {added && !planned && !reading && unread.length === 0 && !busy && (
        <ThemedView type="successSoft" style={styles.note}>
          <ThemedText type="smallBold">{t('mat.allRead')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('mat.allReadHint')}
          </ThemedText>
          <Button
            title={t('mat.replan')}
            variant="secondary"
            onPress={() =>
              run(t('mat.replanning'), async () => {
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
          {t('mat.empty')}
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
          onDelete={() => run(t('mat.deleting'), () => deleteMaterial(material))}
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
  const { t } = useT();
  const role = material.role ? ROLE_LABELS[material.role] : null;
  const read = material.text !== null;
  const parts = material.paths.length;

  let status: string;
  const roleName = role ? t(role.label) : t('mat.material');
  if (read) status = t(open ? 'mat.readOpen' : 'mat.readClosed', { role: roleName });
  else if (material.legacy) status = t('mat.legacy');
  else if (active) status = t('mat.readingPart', { part: material.partsRead + 1, parts });
  else if (material.partsRead > 0) {
    status = t('mat.partsRead', { n: material.partsRead, parts }) + (queued ? t('mat.waiting') : '');
  } else status = t(queued ? 'mat.uploadedWaiting' : 'mat.uploadedUnread');

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
          {t('mat.readErrorKept', { error: readError })}
        </ThemedText>
      )}
      {open && material.text !== null && (
        <ThemedText type="small" selectable>
          {material.text}
        </ThemedText>
      )}
      {(open || material.legacy) && (
        <Button title={t('mat.delete')} variant="secondary" onPress={onDelete} disabled={!canDelete} />
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
