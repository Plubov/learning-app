-- Points.
-- Every answer earns points by how hard its kind of exercise is; a wrong
-- answer earns none. The day's points are kept in daily_activity next to the
-- day's reviews, and a day now counts for the streak when EITHER goal is
-- reached: the number of reviews (profiles.daily_goal) or the number of
-- points (profiles.daily_points). So a learner can do lessons and practice
-- instead of flashcards and still keep the streak.
--
-- The points of a day are a summary of review_events (rule: statistics are
-- derived from the events); event_points below is the one place that says
-- what an answer is worth, and it is used both for new answers and to fill
-- in the days before this migration.

-------------------------------------------------------------------------------
-- event_points: what one answer is worth.
--   card reviews (p_card_type set), unless rated "again":
--     recognition 5 (the answer is only looked at), listening and
--     production 10 (the answer is typed)
--   exercises of a practice session (p_exercise), when correct:
--     match 2 (per pair), choice and listen 5, typed 10, build 15
-------------------------------------------------------------------------------
create function public.event_points(
  p_card_type text,
  p_exercise text,
  p_rating smallint,
  p_correct boolean
)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_card_type is not null then
      case
        when p_rating <= 1 then 0
        when p_card_type = 'recognition' then 5
        else 10
      end
    when p_correct is not true then 0
    else case coalesce(p_exercise, 'choice')
      when 'match' then 2
      when 'choice' then 5
      when 'listen' then 5
      when 'typed' then 10
      when 'build' then 15
      else 5
    end
  end;
$$;

revoke execute on function public.event_points(text, text, smallint, boolean) from public, anon;
grant execute on function public.event_points(text, text, smallint, boolean) to authenticated;

-------------------------------------------------------------------------------
-- profiles.daily_points: points per day that count as the day's goal.
-------------------------------------------------------------------------------
alter table public.profiles
  add column daily_points int not null default 100 check (daily_points > 0);

-------------------------------------------------------------------------------
-- daily_activity: the day's points, and the points goal that applies to the
-- day (like `goal`: follows the profile until the day's goal is met).
-------------------------------------------------------------------------------
alter table public.daily_activity
  add column points int not null default 0 check (points >= 0),
  add column points_goal int not null default 100 check (points_goal > 0);

-- Points of the days before this migration, counted in each user's profile
-- time zone. A day with practice but no card review had no row yet and gets
-- one. goal_met_at is left alone: the past is not rewritten.
with ev as (
  select e.user_id, p.timezone as tz, p.daily_goal as goal,
         (e.reviewed_at at time zone p.timezone)::date as day,
         public.event_points(c.card_type, e.response ->> 'exercise', e.rating, e.correct) as points
  from public.review_events e
  join public.profiles p on p.user_id = e.user_id
  left join public.cards c on c.id = e.card_id
)
insert into public.daily_activity as d
  (user_id, local_date, time_zone, reviews, goal, points)
select ev.user_id, ev.day, min(ev.tz), 0, min(ev.goal), sum(ev.points)
from ev
group by ev.user_id, ev.day
on conflict (user_id, local_date) do update set points = excluded.points;

-------------------------------------------------------------------------------
-- count_activity: adds one answer to its day and says whether it reached
-- the day's goal. Used by record_review and record_quiz_answer, in the same
-- transaction as the event. It runs as the calling user (Row Level Security
-- applies), so it needs the same grant as the two functions that call it.
-- Returns {"reviews_today", "goal", "points", "points_today", "points_goal",
-- "goal_reached"}; goal_reached is true only for the answer that reached
-- the first of the two goals.
-------------------------------------------------------------------------------
create function public.count_activity(
  p_at timestamptz,
  p_time_zone text,
  p_reviews int,
  p_new_items int,
  p_duration_ms int,
  p_points int
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_time_zone text;
  v_goal int;
  v_points_goal int;
  v_day public.daily_activity;
  v_goal_reached boolean := false;
begin
  -- An unknown time zone name must not lose the answer: use the profile's.
  v_time_zone := p_time_zone;
  if v_time_zone is not null then
    begin
      perform now() at time zone v_time_zone;
    exception when invalid_parameter_value then
      v_time_zone := null;
    end;
  end if;
  select coalesce(v_time_zone, p.timezone), p.daily_goal, p.daily_points
    into v_time_zone, v_goal, v_points_goal
  from public.profiles p
  where p.user_id = (select auth.uid());

  insert into public.daily_activity as d
    (local_date, time_zone, reviews, new_items, duration_ms, goal, points, points_goal)
  values
    ((p_at at time zone coalesce(v_time_zone, 'UTC'))::date,
     coalesce(v_time_zone, 'UTC'), p_reviews, p_new_items, coalesce(p_duration_ms, 0),
     coalesce(v_goal, 20), p_points, coalesce(v_points_goal, 100))
  on conflict (user_id, local_date) do update set
    reviews = d.reviews + excluded.reviews,
    new_items = d.new_items + excluded.new_items,
    duration_ms = d.duration_ms + excluded.duration_ms,
    points = d.points + excluded.points,
    goal = case when d.goal_met_at is null then excluded.goal else d.goal end,
    points_goal = case when d.goal_met_at is null then excluded.points_goal else d.points_goal end
  returning d.* into v_day;

  if v_day.goal_met_at is null
     and (v_day.reviews >= v_day.goal or v_day.points >= v_day.points_goal) then
    update public.daily_activity set goal_met_at = p_at where id = v_day.id;
    v_goal_reached := true;
  end if;

  return jsonb_build_object(
    'reviews_today', v_day.reviews,
    'goal', v_day.goal,
    'points', p_points,
    'points_today', v_day.points,
    'points_goal', v_day.points_goal,
    'goal_reached', v_goal_reached);
end;
$$;

revoke execute on function public.count_activity(timestamptz, text, int, int, int, int) from public, anon;
grant execute on function public.count_activity(timestamptz, text, int, int, int, int) to authenticated;

-------------------------------------------------------------------------------
-- record_review: as before; the day's counting moved into count_activity
-- and now includes the points of the review. Same parameters; the returned
-- value has the points as well (see count_activity).
-------------------------------------------------------------------------------
create or replace function public.record_review(
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
  v_card_type text;
  v_new_items int;
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
  returning item_id, card_type into v_item_id, v_card_type;

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

  return public.count_activity(
    p_reviewed_at, p_time_zone, 1, v_new_items, p_duration_ms,
    public.event_points(v_card_type, null, p_rating, p_correct));
end;
$$;

-------------------------------------------------------------------------------
-- record_quiz_answer: as before, plus the points of the answer for its day.
-- New last parameter p_time_zone (the device's IANA time zone), and it now
-- returns what count_activity returns. A quiz answer is still not a review:
-- it adds points, not reviews.
-------------------------------------------------------------------------------
drop function public.record_quiz_answer(uuid, uuid, boolean, jsonb, timestamptz, int, text);

create function public.record_quiz_answer(
  p_lesson_id uuid,
  p_item_id uuid,
  p_correct boolean,
  p_response jsonb,          -- e.g. {"type": "choice", "value": "...", "exercise": "choice"}
  p_reviewed_at timestamptz,
  p_duration_ms int default null,
  p_device_id text default null,
  p_time_zone text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.items i
                 where i.id = p_item_id and i.lesson_id = p_lesson_id) then
    raise exception 'item does not belong to the lesson' using errcode = 'no_data_found';
  end if;

  insert into public.review_events
    (lesson_id, item_id, rating, correct, response, duration_ms, reviewed_at, device_id)
  values
    (p_lesson_id, p_item_id, case when p_correct then 3 else 1 end, p_correct, p_response,
     p_duration_ms, p_reviewed_at, p_device_id);

  return public.count_activity(
    p_reviewed_at, p_time_zone, 0, 0, p_duration_ms,
    public.event_points(null, p_response ->> 'exercise', null, p_correct));
end;
$$;

revoke execute on function public.record_quiz_answer(uuid, uuid, boolean, jsonb, timestamptz, int, text, text)
  from public, anon;
grant execute on function public.record_quiz_answer(uuid, uuid, boolean, jsonb, timestamptz, int, text, text)
  to authenticated;
