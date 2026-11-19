import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { GoalStepper } from '@/components/goal-stepper';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusQuery } from '@/hooks/use-focus-query';
import { useTheme } from '@/hooks/use-theme';
import { linkLabel, normalizeLink } from '@/lib/focus';
import {
  deleteProject,
  loadFocusProject,
  updateFocusSettings,
  type FocusLink,
  type FocusProject,
} from '@/lib/focus-data';
import { useT } from '@/lib/i18n';

/**
 * Timer settings of a course or project: the weekly goal and the allowed
 * links; for a plain project also its name, and deleting it. Every change is
 * saved at once.
 */
export default function ProjectSettingsScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { t } = useT();
  const theme = useTheme();
  const load = useCallback(
    () =>
      loadFocusProject(courseId).then(
        (data) => ({ data, error: null }),
        (reason: unknown) => ({ data: null, error: { message: String(reason) } }),
      ),
    [courseId],
  );
  const { data: loaded, error: loadError } = useFocusQuery(load);

  if (!loaded) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        {loadError ? (
          <ThemedText style={{ color: theme.danger }}>{loadError}</ThemedText>
        ) : (
          <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>
        )}
      </Screen>
    );
  }
  return <Settings key={loaded.id} project={loaded} />;
}

function Settings({ project }: { project: FocusProject }) {
  const { t } = useT();
  const theme = useTheme();
  const isProject = project.kind === 'project';
  const [name, setName] = useState(project.title);
  const [savedName, setSavedName] = useState(project.title);
  const [minutes, setMinutes] = useState(project.weeklyMinutes);
  const [links, setLinks] = useState<FocusLink[]>(project.links);
  const [newLink, setNewLink] = useState('');
  const [linkError, setLinkError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // A pending "really delete?" question goes away after a while.
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), 8000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  /** Saves a change; on failure the screen goes back to the previous value. */
  function save(change: Parameters<typeof updateFocusSettings>[1], undo: () => void) {
    setError(null);
    updateFocusSettings(project.id, change).catch((reason: unknown) => {
      undo();
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }

  function changeGoal(next: number | null) {
    const previous = minutes;
    setMinutes(next);
    save({ weeklyMinutes: next }, () => setMinutes(previous));
  }

  function addLink() {
    const url = normalizeLink(newLink);
    if (!url) {
      setLinkError(true);
      return;
    }
    setLinkError(false);
    setNewLink('');
    if (links.some((link) => link.url === url)) return;
    const previous = links;
    const next = [...links, { url, label: linkLabel(url) }];
    setLinks(next);
    save({ links: next }, () => setLinks(previous));
  }

  function removeLink(url: string) {
    const previous = links;
    const next = links.filter((link) => link.url !== url);
    setLinks(next);
    save({ links: next }, () => setLinks(previous));
  }

  function saveName() {
    const previous = savedName;
    setSavedName(name.trim());
    save({ name }, () => setSavedName(previous));
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteProject(project.id);
      router.back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setDeleting(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: isProject ? t('project.settings') : project.title }} />

      {isProject && (
        <>
          <TextField label={t('project.name')} value={name} onChangeText={setName} maxLength={120} />
          {name.trim() !== '' && name.trim() !== savedName && (
            <Button title={t('project.saveName')} variant="secondary" onPress={saveName} />
          )}
        </>
      )}

      <ThemedText type="smallBold">{t('project.weeklyGoal')}</ThemedText>
      <GoalStepper minutes={minutes} onChange={changeGoal} />

      <ThemedText type="smallBold">{t('project.links')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('project.linksHint')}
      </ThemedText>
      {links.map((link) => (
        <ThemedView key={link.url} type="backgroundElement" style={styles.link}>
          <View style={styles.grow}>
            <ThemedText style={styles.linkLabel}>{link.label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {link.url}
            </ThemedText>
          </View>
          <Pressable
            onPress={() => removeLink(link.url)}
            accessibilityRole="button"
            accessibilityLabel={t('project.removeLink', { site: link.label })}
            hitSlop={Spacing.two}>
            <ThemedText style={styles.remove} themeColor="textSecondary">
              ✕
            </ThemedText>
          </Pressable>
        </ThemedView>
      ))}
      <View style={styles.addRow}>
        <View style={styles.grow}>
          <TextField
            placeholder={t('project.linkPlaceholder')}
            value={newLink}
            onChangeText={(text) => {
              setNewLink(text);
              setLinkError(false);
            }}
            onSubmitEditing={addLink}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
        <Button title={t('project.addLink')} variant="secondary" onPress={addLink} disabled={newLink.trim() === ''} />
      </View>
      {linkError && <ThemedText style={{ color: theme.danger }}>{t('project.badLink')}</ThemedText>}

      {error && <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>}

      {isProject && (
        <View style={styles.danger}>
          {confirmDelete ? (
            <>
              <ThemedText>{t('project.deleteConfirm', { name: savedName })}</ThemedText>
              <Button title={t('project.deleteYes')} tone="danger" onPress={remove} busy={deleting} />
              <Button title={t('common.back')} variant="secondary" onPress={() => setConfirmDelete(false)} />
            </>
          ) : (
            <Button title={t('project.delete')} variant="secondary" onPress={() => setConfirmDelete(true)} />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  linkLabel: { fontWeight: 700 },
  remove: { fontSize: 18, lineHeight: 24 },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  danger: { marginTop: Spacing.four, gap: Spacing.two },
});
