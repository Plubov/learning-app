/**
 * Loads and changes the daily goal and streak. The counting rules are in
 * streak.ts; this file only talks to the database.
 */
import { currentStreak, longestStreak, toIsoDate } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { deviceTimeZone } from '@/lib/time-zone';

export type GoalStatus = {
  /** Reviews per day the learner aims for. */
  goal: number;
  todayReviews: number;
  metToday: boolean;
  streak: number;
  longest: number;
};

export const MIN_DAILY_GOAL = 5;
export const MAX_DAILY_GOAL = 500;

/** Enough days for any streak worth showing; also stays under the API's row limit. */
const HISTORY_DAYS = 1000;

export async function loadGoalStatus(): Promise<GoalStatus> {
  const [profile, days] = await Promise.all([
    supabase.from('profiles').select('daily_goal').single(),
    supabase
      .from('daily_activity')
      .select('local_date, reviews, goal_met_at')
      .order('local_date', { ascending: false })
      .limit(HISTORY_DAYS),
  ]);
  const failed = profile.error ?? days.error;
  if (failed) throw new Error(failed.message);
  if (!profile.data) throw new Error('Profile not found');

  const rows = days.data ?? [];
  const today = toIsoDate(new Date());
  const todayRow = rows.find((r) => r.local_date === today);
  const metDates = rows.filter((r) => r.goal_met_at !== null).map((r) => r.local_date);
  return {
    goal: profile.data.daily_goal,
    todayReviews: todayRow?.reviews ?? 0,
    metToday: todayRow?.goal_met_at != null,
    streak: currentStreak(metDates, today),
    longest: longestStreak(metDates),
  };
}

/** Changes the goal from today on; days already finished keep their goal. */
export async function setDailyGoal(goal: number): Promise<void> {
  const clamped = Math.min(MAX_DAILY_GOAL, Math.max(MIN_DAILY_GOAL, Math.round(goal)));
  const { error } = await supabase
    .from('profiles')
    .update({ daily_goal: clamped })
    .eq('user_id', await currentUserId());
  if (error) throw new Error(error.message);
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Not logged in');
  return id;
}

/**
 * Stores the device's time zone in the profile when it has changed (e.g. on
 * the first start, or after travelling). Used where the app cannot pass it
 * itself, such as reminders later. Failures are ignored: it is retried on
 * the next start and nothing depends on it right away.
 */
export async function syncTimeZone(): Promise<void> {
  const timeZone = deviceTimeZone();
  await supabase
    .from('profiles')
    .update({ timezone: timeZone })
    .eq('user_id', await currentUserId())
    .neq('timezone', timeZone);
}
