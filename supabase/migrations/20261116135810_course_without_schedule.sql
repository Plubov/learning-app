-- A course can be studied without a week schedule ("at my own pace").
-- The planner decides this from the learner's wish; the plan then carries
-- "scheduled": false, and the app shows the lessons in order without weeks.
-- lessons.week stays (it is 1 for every lesson of such a plan), so a course
-- can get a schedule again later without a change to the table.

alter table public.courses
  add column scheduled boolean not null default true;  -- false = no week schedule

-- save_course_plan: as before, and also stores "scheduled" from the plan.
-- p_plan: {"title", "summary", "subject", "target_lang", "scheduled",
--          "stages": [...],
--          "lessons": [{"title", "summary", "objectives", "week", "stage"}]}
create or replace function public.save_course_plan(p_course_id uuid, p_plan jsonb, p_model text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_deck_id uuid;
  v_found boolean;
  v_base int;
begin
  select true, c.deck_id into v_found, v_deck_id
  from public.courses c where c.id = p_course_id for update;
  if v_found is null then
    raise exception 'course not found' using errcode = 'no_data_found';
  end if;

  if v_deck_id is null then
    insert into public.decks (name, subject, target_lang)
    values (p_plan ->> 'title', p_plan ->> 'subject', nullif(p_plan ->> 'target_lang', ''))
    returning id into v_deck_id;
  end if;

  update public.courses set
    deck_id = v_deck_id,
    title = p_plan ->> 'title',
    summary = p_plan ->> 'summary',
    roadmap = p_plan -> 'stages',
    scheduled = coalesce((p_plan ->> 'scheduled')::boolean, true),
    planned_at = now(),
    plan_model = p_model
  where id = p_course_id;

  delete from public.lessons where course_id = p_course_id and prepared_at is null;
  select coalesce(max(position), 0) into v_base
  from public.lessons where course_id = p_course_id;

  insert into public.lessons (course_id, position, stage, week, title, summary, objectives)
  select p_course_id, v_base + l.n, (l.value ->> 'stage')::int, (l.value ->> 'week')::int,
         l.value ->> 'title', l.value ->> 'summary', l.value -> 'objectives'
  from jsonb_array_elements(p_plan -> 'lessons') with ordinality as l(value, n);
end;
$$;
