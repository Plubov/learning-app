/**
 * Loads and saves focus time and project settings. The calculations are in
 * focus.ts; this file only talks to the database.
 */
import { getDeviceId } from '@/lib/device-id';
import { toIsoDate } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { deviceTimeZone } from '@/lib/time-zone';

export type FocusLink = { label: string; url: string };

/** A course or project as the focus timer sees it. */
export type FocusProject = {
  id: string;
  title: string;
  /** 'project': only a name, for time tracking. The others are learning courses. */
  kind: 'guided' | 'study' | 'project';
  weeklyMinutes: number | null;
  links: FocusLink[];
  /** Time this week so far, today included. */
  weekMs: number;
  todayMs: number;
};

/** The stored list of links; anything that is not {label, url} is skipped. */
function parseLinks(value: unknown): FocusLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { label, url } = entry as Record<string, unknown>;
    return typeof url === 'string' ? [{ url, label: typeof label === 'string' ? label : url }] : [];
  });
}

function kindOf(kind: string): FocusProject['kind'] {
  return kind === 'study' || kind === 'project' ? kind : 'guided';
}

/**
 * All courses and projects with this week's time. Those with a weekly goal
 * come first, then the ones worked on most this week.
 */
export async function loadFocusProjects(): Promise<FocusProject[]> {
  const [courses, totals] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, goal, kind, weekly_minutes, focus_links, created_at')
      .order('created_at', { ascending: false }),
    supabase.rpc('focus_totals', { p_time_zone: deviceTimeZone(), p_today: toIsoDate(new Date()) }),
  ]);
  const failed = courses.error ?? totals.error;
  if (failed) throw new Error(failed.message);
  const byCourse = new Map((totals.data ?? []).map((row) => [row.course_id, row]));
  return (courses.data ?? [])
    .map((course) => ({
      id: course.id,
      title: course.title ?? course.goal,
      kind: kindOf(course.kind),
      weeklyMinutes: course.weekly_minutes,
      links: parseLinks(course.focus_links),
      weekMs: byCourse.get(course.id)?.week_ms ?? 0,
      todayMs: byCourse.get(course.id)?.today_ms ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.weeklyMinutes !== null) - Number(a.weeklyMinutes !== null) || b.weekMs - a.weekMs,
    );
}

export async function loadFocusProject(courseId: string): Promise<FocusProject> {
  const project = (await loadFocusProjects()).find((p) => p.id === courseId);
  if (!project) throw new Error('Project not found');
  return project;
}

/** Creates a plain project (only a name) and returns its id. */
export async function createProject(name: string, weeklyMinutes: number | null): Promise<string> {
  const title = name.normalize('NFC').trim();
  const { data, error } = await supabase
    .from('courses')
    .insert({ goal: title, title, kind: 'project', weekly_minutes: weeklyMinutes })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Changes the timer settings of a course or project; `name` only for projects. */
export async function updateFocusSettings(
  courseId: string,
  change: { name?: string; weeklyMinutes?: number | null; links?: FocusLink[] },
): Promise<void> {
  const update: { goal?: string; title?: string; weekly_minutes?: number | null; focus_links?: FocusLink[] } = {};
  if (change.name !== undefined) {
    const title = change.name.normalize('NFC').trim();
    update.goal = title;
    update.title = title;
  }
  if (change.weeklyMinutes !== undefined) update.weekly_minutes = change.weeklyMinutes;
  if (change.links !== undefined) update.focus_links = change.links;
  let query = supabase.from('courses').update(update).eq('id', courseId);
  // A learning course keeps its own goal and title.
  if (change.name !== undefined) query = query.eq('kind', 'project');
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/** Deletes a plain project and its tracked time. Learning courses are not deleted here. */
export async function deleteProject(courseId: string): Promise<void> {
  const { error } = await supabase.from('courses').delete().eq('id', courseId).eq('kind', 'project');
  if (error) throw new Error(error.message);
}

/** Saves one stretch of uninterrupted work. Stretches under a second are skipped. */
export async function saveFocusTime(courseId: string, startedAt: number, endedAt: number): Promise<void> {
  if (endedAt - startedAt < 1000) return;
  const { error } = await supabase.from('focus_time').insert({
    course_id: courseId,
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(endedAt).toISOString(),
    device_id: await getDeviceId(),
  });
  if (error) throw new Error(error.message);
}
