-- Focus timer: tracked work time per course or project, with a weekly goal.
--
-- A "project" is a third kind of course: only a name (e.g. "Work"), no plan,
-- lessons or deck. Every course and project can have a weekly goal in
-- minutes and a list of allowed links (sites that may be opened while the
-- timer runs). The time itself is stored in focus_time as stretches of
-- uninterrupted work; the app writes one row when the timer pauses or stops,
-- and every minute while it runs, so little is lost if the app is closed.
-- Like review_events, focus_time is append-only.

-------------------------------------------------------------------------------
-- courses: kind 'project', weekly goal, allowed links.
-------------------------------------------------------------------------------
alter table public.courses drop constraint courses_kind_check;
alter table public.courses add constraint courses_kind_check
  check (kind in ('guided', 'study', 'project'));

alter table public.courses
  -- Minutes per week the learner wants to work on it; null = no goal.
  add column weekly_minutes int check (weekly_minutes between 15 and 10080),
  -- Sites that keep the timer running: [{"label": "...", "url": "https://..."}].
  add column focus_links jsonb not null default '[]'
    check (jsonb_typeof(focus_links) = 'array' and jsonb_array_length(focus_links) <= 20);

-------------------------------------------------------------------------------
-- focus_time: one stretch of uninterrupted work on a course or project.
-------------------------------------------------------------------------------
create table public.focus_time (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null,
  started_at timestamptz not null,   -- time on the device
  ended_at timestamptz not null,
  device_id text,
  created_at timestamptz not null default now(),
  -- A stretch is at most 6 hours: the app writes one at least every minute.
  check (ended_at > started_at and ended_at - started_at <= interval '6 hours'),
  -- Deleting a project deletes its time.
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade
);

create index focus_time_user_started_idx on public.focus_time (user_id, started_at);
create index focus_time_course_id_idx on public.focus_time (course_id);

alter table public.focus_time enable row level security;

-- Read and insert only; no update or delete policy (append-only).
create policy "focus_time: owner can read" on public.focus_time
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "focus_time: owner can insert" on public.focus_time
  for insert to authenticated with check ((select auth.uid()) = user_id);

revoke update, delete on public.focus_time from authenticated, anon;

-------------------------------------------------------------------------------
-- focus_totals: time per course this week and today, counted in the device's
-- time zone. The week starts on Monday. p_today is the device's date, so the
-- app and the database agree on which day it is.
-- Returns one row per course with time this week: course_id, week_ms (whole
-- week so far), today_ms. Runs as the caller, so only their own rows count.
-------------------------------------------------------------------------------
create function public.focus_totals(p_time_zone text, p_today date)
returns table (course_id uuid, week_ms bigint, today_ms bigint)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select (p_today - (extract(isodow from p_today)::int - 1))::timestamp at time zone p_time_zone as week_from,
           p_today::timestamp at time zone p_time_zone as today_from
  )
  select f.course_id,
         sum(extract(epoch from (f.ended_at - f.started_at)) * 1000)::bigint as week_ms,
         coalesce(sum(extract(epoch from (f.ended_at - f.started_at)) * 1000)
                    filter (where f.started_at >= b.today_from), 0)::bigint as today_ms
  from public.focus_time f, bounds b
  where f.started_at >= b.week_from
    and f.started_at < b.today_from + interval '1 day'
  group by f.course_id;
$$;

revoke execute on function public.focus_totals(text, date) from public, anon;
grant execute on function public.focus_totals(text, date) to authenticated;
