-- Daily goal and streak (M5).
-- The goal is a number of reviews per day (profiles.daily_goal). Each day's
-- progress is kept in daily_activity, updated by record_review in the same
-- transaction as the review. The streak (days in a row with the goal met) is
-- computed in the app from daily_activity (src/lib/streak.ts).

-------------------------------------------------------------------------------
-- profiles.daily_goal: reviews per day, 20 unless the learner changes it.
-------------------------------------------------------------------------------
alter table public.profiles alter column daily_goal set default 20;
update public.profiles set daily_goal = 20 where daily_goal is null;
alter table public.profiles alter column daily_goal set not null;

-------------------------------------------------------------------------------
-- daily_activity: one row per user and local day. A summary of review_events
-- kept for the streak; it can be rebuilt from the events if ever needed.
-------------------------------------------------------------------------------
create table public.daily_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,       -- the day in the learner's time zone
  time_zone text not null,        -- IANA name the day was counted in
  reviews int not null default 0 check (reviews >= 0),
  new_items int not null default 0 check (new_items >= 0),
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  -- The goal that applies to this day. Follows profiles.daily_goal until the
  -- goal is met, then stays fixed, so changing the goal never rewrites the past.
  goal int not null check (goal > 0),
  goal_met_at timestamptz,        -- null = goal not (yet) reached that day
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

alter table public.daily_activity enable row level security;

-- Read, insert and update (record_review runs as the user). No delete: the
-- history only disappears with the account.
create policy "daily_activity: owner can read" on public.daily_activity
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "daily_activity: owner can insert" on public.daily_activity
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "daily_activity: owner can update" on public.daily_activity
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger daily_activity_set_updated_at before update on public.daily_activity
  for each row execute function public.set_updated_at();

-- Days already studied before this migration, counted in each user's profile
-- time zone. goal_met_at is the time of the goal-th review of the day.
with ev as (
  select e.user_id, p.timezone as tz, p.daily_goal as goal,
         (e.reviewed_at at time zone p.timezone)::date as day,
         e.reviewed_at, e.duration_ms
  from public.review_events e
  join public.profiles p on p.user_id = e.user_id
), intro as (
  select i.user_id, (i.introduced_at at time zone p.timezone)::date as day, count(*) as n
  from public.items i
  join public.profiles p on p.user_id = i.user_id
  where i.introduced_at is not null
  group by 1, 2
)
insert into public.daily_activity
  (user_id, local_date, time_zone, reviews, new_items, duration_ms, goal, goal_met_at)
select ev.user_id, ev.day, min(ev.tz), count(*), coalesce(min(intro.n), 0),
       coalesce(sum(ev.duration_ms), 0), min(ev.goal),
       (array_agg(ev.reviewed_at order by ev.reviewed_at))[min(ev.goal)]
from ev
left join intro on intro.user_id = ev.user_id and intro.day = ev.day
group by ev.user_id, ev.day;

-------------------------------------------------------------------------------
-- record_review: as before, plus the day's progress. New last parameter
-- p_time_zone (the device's IANA time zone; falls back to the profile's).
-- Now returns {"reviews_today": n, "goal": n, "goal_reached": true/false},
-- where goal_reached is true only for the review that reached the goal.
-------------------------------------------------------------------------------
drop function public.record_review(uuid, smallint, timestamptz, jsonb, boolean, jsonb, int, text);

create function public.record_review(
  p_card_id uuid,
  p_rating smallint,
  p_reviewed_at timestamptz,
  p_schedule jsonb,              -- the scheduling columns of cards, by column name
  p_correct boolean default null,
  p_response jsonb default null, -- e.g. {"type": "text", "value": "..."}
  p_duration_ms int default null,
  p_device_id text default null,
  p_time_zone text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_new_items int;
  v_time_zone text;
  v_goal int;
  v_day public.daily_activity;
  v_goal_reached boolean := false;
begin
  update public.cards set
    due_at = (p_schedule ->> 'due_at')::timestamptz,
    last_review_at = (p_schedule ->> 'last_review_at')::timestamptz,
    stability = (p_schedule ->> 'stability')::double precision,
    stability_fast = (p_schedule ->> 'stability_fast')::double precision,
    difficulty = (p_schedule ->> 'difficulty')::double precision,
    scheduled_days = (p_schedule ->> 'scheduled_days')::double precision,
    learning_step = (p_schedule ->> 'learning_step')::int,
    state = (p_schedule ->> 'state')::smallint,
    schedule_status = p_schedule ->> 'schedule_status',
    reps = (p_schedule ->> 'reps')::int,
    lapses = (p_schedule ->> 'lapses')::int
  where id = p_card_id
  returning item_id into v_item_id;

  if v_item_id is null then
    raise exception 'card not found' using errcode = 'no_data_found';
  end if;

  insert into public.review_events
    (card_id, item_id, rating, correct, response, duration_ms, reviewed_at, device_id)
  values
    (p_card_id, v_item_id, p_rating, p_correct, p_response, p_duration_ms, p_reviewed_at, p_device_id);

  update public.items set introduced_at = p_reviewed_at
  where id = v_item_id and introduced_at is null;
  get diagnostics v_new_items = row_count;

  -- An unknown time zone name must not lose the review: use the profile's.
  v_time_zone := p_time_zone;
  if v_time_zone is not null then
    begin
      perform now() at time zone v_time_zone;
    exception when invalid_parameter_value then
      v_time_zone := null;
    end;
  end if;
  select coalesce(v_time_zone, p.timezone), p.daily_goal
    into v_time_zone, v_goal
  from public.profiles p
  where p.user_id = (select auth.uid());

  insert into public.daily_activity as d
    (local_date, time_zone, reviews, new_items, duration_ms, goal)
  values
    ((p_reviewed_at at time zone coalesce(v_time_zone, 'UTC'))::date,
     coalesce(v_time_zone, 'UTC'), 1, v_new_items, coalesce(p_duration_ms, 0), coalesce(v_goal, 20))
  on conflict (user_id, local_date) do update set
    reviews = d.reviews + 1,
    new_items = d.new_items + excluded.new_items,
    duration_ms = d.duration_ms + excluded.duration_ms,
    goal = case when d.goal_met_at is null then excluded.goal else d.goal end
  returning d.* into v_day;

  if v_day.goal_met_at is null and v_day.reviews >= v_day.goal then
    update public.daily_activity set goal_met_at = p_reviewed_at where id = v_day.id;
    v_goal_reached := true;
  end if;

  return jsonb_build_object(
    'reviews_today', v_day.reviews,
    'goal', v_day.goal,
    'goal_reached', v_goal_reached);
end;
$$;

revoke execute on function public.record_review(uuid, smallint, timestamptz, jsonb, boolean, jsonb, int, text, text)
  from public, anon;
grant execute on function public.record_review(uuid, smallint, timestamptz, jsonb, boolean, jsonb, int, text, text)
  to authenticated;
