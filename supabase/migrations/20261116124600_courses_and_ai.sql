-- Courses: AI-planned lessons on top of the existing knowledge model.
-- A course is created from a learning goal (plus optional pasted material).
-- The plan (roadmap, timeline, lessons) is generated once by the Edge
-- Function "ai" and stored here; lessons then get their explanation and items
-- once, and fresh practice (examples, quiz) on demand. See docs/SPEC.md.
--
-- Everything the AI produced is written through the functions at the end of
-- this file, called by the Edge Function after it has validated the output.

-- Courses on any subject get their own deck; 'general' covers what is neither
-- a language nor a science.
alter table public.decks drop constraint decks_subject_check;
alter table public.decks add constraint decks_subject_check
  check (subject in ('language', 'science', 'general'));

-------------------------------------------------------------------------------
-- courses
-------------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- What the learner typed.
  goal text not null check (length(trim(goal)) > 0 and length(goal) <= 2000 and goal is nfc normalized),
  level text check (length(level) <= 500 and level is nfc normalized),  -- what they already know
  weeks int check (weeks between 1 and 104),  -- wanted duration; null = the planner decides
  minutes_per_day int not null default 20 check (minutes_per_day between 5 and 480),
  source_id uuid,  -- pasted course material, if any
  -- Filled in by the plan.
  deck_id uuid,    -- the deck that holds this course's items (cards, reviews)
  title text check (title is nfc normalized),
  summary text check (summary is nfc normalized),
  roadmap jsonb,   -- stages: [{"title": "...", "outcome": "..."}]
  planned_at timestamptz,  -- null = no plan yet
  plan_model text,         -- model that wrote the current plan
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_id, user_id) references public.sources (id, user_id) on delete set null (source_id),
  foreign key (deck_id, user_id) references public.decks (id, user_id) on delete set null (deck_id),
  unique (id, user_id)
);

create index courses_user_id_idx on public.courses (user_id);

alter table public.courses enable row level security;

create policy "courses: owner can read" on public.courses
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "courses: owner can insert" on public.courses
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "courses: owner can update" on public.courses
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "courses: owner can delete" on public.courses
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger courses_set_updated_at before update on public.courses
  for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- lessons: the ordered steps of a course.
-------------------------------------------------------------------------------
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null,
  position int not null,           -- order within the course
  stage int not null default 0 check (stage >= 0),  -- index into courses.roadmap
  week int not null check (week >= 1),              -- timeline: week of the course
  title text not null check (length(trim(title)) > 0 and title is nfc normalized),
  summary text not null check (summary is nfc normalized),
  objectives jsonb not null default '[]',  -- list of strings
  -- Written once, on the first start of the lesson.
  explanation jsonb,               -- {"intro": "...", "key_points": ["..."]}
  prepared_at timestamptz,         -- null = not started; items do not exist yet
  -- The latest generated practice; replaced whenever new practice is made.
  practice jsonb,                  -- {"examples": [...], "questions": [...]}
  practice_at timestamptz,
  completed_at timestamptz,        -- first finished quiz
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade,
  unique (id, user_id)
);

create index lessons_user_id_idx on public.lessons (user_id);
create index lessons_course_id_position_idx on public.lessons (course_id, position);

alter table public.lessons enable row level security;

create policy "lessons: owner can read" on public.lessons
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "lessons: owner can insert" on public.lessons
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "lessons: owner can update" on public.lessons
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "lessons: owner can delete" on public.lessons
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger lessons_set_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();

-- The lesson an item was introduced in. Deleting the lesson keeps the item.
alter table public.items add column lesson_id uuid;
alter table public.items
  add constraint items_lesson_fkey foreign key (lesson_id, user_id)
  references public.lessons (id, user_id) on delete set null (lesson_id);
create index items_lesson_id_idx on public.items (lesson_id);

-------------------------------------------------------------------------------
-- course_messages: the chat with the tutor, per course.
-------------------------------------------------------------------------------
create table public.course_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) <= 20000),
  -- Set on a tutor message that proposes changing the plan: the instruction
  -- handed to the planner when the learner agrees.
  plan_change text,
  created_at timestamptz not null default now(),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade
);

create index course_messages_user_id_idx on public.course_messages (user_id);
create index course_messages_course_id_created_at_idx on public.course_messages (course_id, created_at);

alter table public.course_messages enable row level security;

-- Messages are not edited: read, insert and delete only.
create policy "course_messages: owner can read" on public.course_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "course_messages: owner can insert" on public.course_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "course_messages: owner can delete" on public.course_messages
  for delete to authenticated using ((select auth.uid()) = user_id);

-------------------------------------------------------------------------------
-- ai_usage: one row per AI call (CLAUDE.md rule 6). No prompt or response
-- text. Written only by the Edge Function with the service role, so a user
-- can read but not forge or erase their usage (it also backs the daily limit).
-------------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid,  -- the user's own AI connection, once those exist
  task text not null,  -- 'plan_course', 'prepare_lesson', 'generate_practice', 'chat', ...
  model text not null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cost_estimate numeric(12, 6),  -- US dollars; null when the price is unknown
  ok boolean not null,
  created_at timestamptz not null default now()
);

create index ai_usage_user_id_created_at_idx on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;

create policy "ai_usage: owner can read" on public.ai_usage
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.ai_usage from anon, authenticated;

-------------------------------------------------------------------------------
-- review_events: quiz answers. A quiz answer belongs to a lesson instead of a
-- card: it is part of the learning record but does not move a card's schedule.
-- Exactly one of card_id and lesson_id is set.
-------------------------------------------------------------------------------
alter table public.review_events alter column card_id drop not null;
alter table public.review_events add column lesson_id uuid;
alter table public.review_events
  add constraint review_events_lesson_fkey foreign key (lesson_id, user_id)
  references public.lessons (id, user_id) on delete cascade;
alter table public.review_events
  add constraint review_events_card_or_lesson check ((card_id is null) <> (lesson_id is null));
create index review_events_lesson_id_idx on public.review_events (lesson_id);

-------------------------------------------------------------------------------
-- save_course_plan: stores a validated plan in one transaction. On the first
-- plan it creates the course's deck. On a later plan (the learner changed the
-- goal) lessons already started are kept and all others are replaced.
-- p_plan: {"title", "summary", "subject", "target_lang", "stages": [...],
--          "lessons": [{"title", "summary", "objectives", "week", "stage"}]}
-------------------------------------------------------------------------------
create function public.save_course_plan(p_course_id uuid, p_plan jsonb, p_model text)
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

revoke execute on function public.save_course_plan(uuid, jsonb, text) from public, anon;
grant execute on function public.save_course_plan(uuid, jsonb, text) to authenticated;

-------------------------------------------------------------------------------
-- save_lesson_content: stores a lesson's explanation and creates its items
-- (the items trigger creates their cards). Does nothing when the lesson was
-- already prepared, so a repeated call cannot duplicate anything. A term the
-- deck already has is skipped.
-- p_items: [{"kind", "term", "meaning", "notes"}]
-------------------------------------------------------------------------------
create function public.save_lesson_content(p_lesson_id uuid, p_explanation jsonb, p_items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_deck_id uuid;
  v_prepared_at timestamptz;
  v_found boolean;
begin
  select true, c.deck_id, l.prepared_at into v_found, v_deck_id, v_prepared_at
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where l.id = p_lesson_id
  for update of l;
  if v_found is null or v_deck_id is null then
    raise exception 'lesson not found' using errcode = 'no_data_found';
  end if;
  if v_prepared_at is not null then
    return;
  end if;

  insert into public.items (deck_id, kind, term, meaning, notes, lesson_id)
  select v_deck_id, i.value ->> 'kind', i.value ->> 'term', i.value ->> 'meaning',
         nullif(i.value ->> 'notes', ''), p_lesson_id
  from jsonb_array_elements(p_items) with ordinality as i(value, n)
  order by i.n
  on conflict (deck_id, kind, term) do nothing;

  update public.lessons set explanation = p_explanation, prepared_at = now()
  where id = p_lesson_id;
end;
$$;

revoke execute on function public.save_lesson_content(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_lesson_content(uuid, jsonb, jsonb) to authenticated;

-------------------------------------------------------------------------------
-- record_quiz_answer: appends one quiz answer to the learning record.
-- Rating: 3 (good) when correct, 1 (again) when wrong.
-------------------------------------------------------------------------------
create function public.record_quiz_answer(
  p_lesson_id uuid,
  p_item_id uuid,
  p_correct boolean,
  p_response jsonb,          -- e.g. {"type": "choice", "value": "..."}
  p_reviewed_at timestamptz,
  p_duration_ms int default null,
  p_device_id text default null
)
returns void
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
end;
$$;

revoke execute on function public.record_quiz_answer(uuid, uuid, boolean, jsonb, timestamptz, int, text)
  from public, anon;
grant execute on function public.record_quiz_answer(uuid, uuid, boolean, jsonb, timestamptz, int, text)
  to authenticated;

-------------------------------------------------------------------------------
-- review_stats: unchanged, except that it counts card reviews only (quiz
-- answers have no card), so its numbers keep matching the daily goal.
-------------------------------------------------------------------------------
create or replace function public.review_stats(
  p_time_zone text,
  p_card_types text[],
  p_days int default 14
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := (now() at time zone p_time_zone)::date;
  v_today_start timestamptz := v_today::timestamp at time zone p_time_zone;
  -- Day boundaries come from local dates, so days with a daylight saving
  -- change (23 or 25 hours) are still counted correctly.
  v_tomorrow_start timestamptz := (v_today + 1)::timestamp at time zone p_time_zone;
  v_tomorrow_end timestamptz := (v_today + 2)::timestamp at time zone p_time_zone;
  v_week_end timestamptz := (v_today + 8)::timestamp at time zone p_time_zone;
  v_first_start timestamptz := (v_today - (p_days - 1))::timestamp at time zone p_time_zone;
  v_today_json jsonb;
  v_days jsonb;
  v_items jsonb;
  v_due jsonb;
begin
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'p_days must be between 1 and 366' using errcode = 'invalid_parameter_value';
  end if;

  select jsonb_build_object(
           'reviews', count(*),
           'again', count(*) filter (where e.rating = 1),
           'duration_ms', coalesce(sum(e.duration_ms), 0),
           'new_items', (select count(*) from public.items i
                         where i.introduced_at >= v_today_start))
    into v_today_json
  from public.review_events e
  where e.reviewed_at >= v_today_start and e.card_id is not null;

  select jsonb_agg(jsonb_build_object(
           'date', d.day,
           'reviews', coalesce(r.reviews, 0),
           'again', coalesce(r.again, 0)) order by d.day)
    into v_days
  from (select v_today - n as day from generate_series(0, p_days - 1) as n) d
  left join (
    select (e.reviewed_at at time zone p_time_zone)::date as day,
           count(*) as reviews,
           count(*) filter (where e.rating = 1) as again
    from public.review_events e
    where e.reviewed_at >= v_first_start and e.card_id is not null
    group by 1
  ) r on r.day = d.day;

  select jsonb_build_object(
           'not_started', count(*) filter (where s.introduced_at is null),
           'learning', count(*) filter (where s.introduced_at is not null and not s.all_review),
           'known', count(*) filter (where s.introduced_at is not null and s.all_review))
    into v_items
  from (
    select i.introduced_at,
           coalesce(bool_and(c.state = 2), false) as all_review
    from public.items i
    left join public.cards c
      on c.item_id = i.id and c.card_type = any (p_card_types) and not c.suspended
    group by i.id
  ) s;

  select jsonb_build_object(
           'tomorrow', count(*) filter (where c.due_at < v_tomorrow_end),
           'next_7_days', count(*))
    into v_due
  from public.cards c
  join public.items i on i.id = c.item_id
  where i.introduced_at is not null
    and not c.suspended
    and c.card_type = any (p_card_types)
    and c.due_at >= v_tomorrow_start
    and c.due_at < v_week_end;

  return jsonb_build_object('today', v_today_json, 'days', v_days, 'items', v_items, 'due', v_due);
end;
$$;

revoke execute on function public.review_stats(text, text[], int) from public, anon;
grant execute on function public.review_stats(text, text[], int) to authenticated;
