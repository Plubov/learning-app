-- Row Level Security and function checks for courses, lessons, the tutor
-- chat, ai_usage, quiz answers and focus time.
-- Run: npx supabase db query --remote -f supabase/tests/rls_courses.sql
-- Everything happens inside one transaction that is rolled back at the end,
-- so no test data remains. Any failed check aborts with "FAIL: ...".
-- Needs at least one real user in the project (user A).

begin;

-- Setup as admin: test user B, plus a course, lesson, message and usage row
-- owned by existing user A.
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-00000000000b', 'rls-test-b@example.invalid',
        'authenticated', 'authenticated');

do $$
declare
  a uuid;
  c uuid;
begin
  select id into a from auth.users
  where id <> '00000000-0000-4000-8000-00000000000b'
  order by created_at limit 1;
  if a is null then
    raise exception 'FAIL: needs one existing user (user A)';
  end if;
  insert into public.courses (user_id, goal) values (a, 'RLS test course of A') returning id into c;
  perform set_config('test.user_a', a::text, true);
  perform set_config('test.course_a', c::text, true);
  insert into public.lessons (user_id, course_id, position, week, title, summary)
  values (a, c, 1, 1, 'Lesson of A', 'x');
  insert into public.course_messages (user_id, course_id, role, content)
  values (a, c, 'user', 'message of A');
  insert into public.ai_usage (user_id, task, model, ok) values (a, 'chat', 'test-model', true);
  insert into public.focus_time (user_id, course_id, started_at, ended_at)
  values (a, c, now() - interval '10 minutes', now());
end $$;

-- From here on act exactly like the app does for logged-in user B.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare
  b constant uuid := '00000000-0000-4000-8000-00000000000b';
  c uuid;
  owner uuid;
  d uuid;
  l1 uuid;
  l2 uuid;
  i uuid;
  n int;
  r jsonb;
  plan constant jsonb := '{
    "title": "Mechanics", "summary": "Newton''s laws.", "subject": "science", "target_lang": "",
    "stages": [{"title": "Basics", "outcome": "Explain the three laws."}],
    "lessons": [
      {"title": "First law", "summary": "Inertia.", "objectives": ["State the law"], "week": 1, "stage": 0},
      {"title": "Second law", "summary": "F = ma.", "objectives": ["Use F = ma"], "week": 1, "stage": 0},
      {"title": "Third law", "summary": "Action and reaction.", "objectives": ["Find pairs"], "week": 2, "stage": 0}
    ]}';
begin
  if auth.uid() is distinct from b then
    raise exception 'FAIL: not acting as user B';
  end if;

  -- B sees nothing of A.
  select count(*) into n from public.courses;
  if n <> 0 then raise exception 'FAIL: B can see the course of A'; end if;
  select count(*) into n from public.lessons;
  if n <> 0 then raise exception 'FAIL: B can see the lesson of A'; end if;
  select count(*) into n from public.course_messages;
  if n <> 0 then raise exception 'FAIL: B can see the message of A'; end if;
  select count(*) into n from public.ai_usage;
  if n <> 0 then raise exception 'FAIL: B can see the AI usage of A'; end if;
  select count(*) into n from public.focus_time;
  if n <> 0 then raise exception 'FAIL: B can see the focus time of A'; end if;
  select count(*) into n from public.focus_totals('UTC', current_date);
  if n <> 0 then raise exception 'FAIL: focus_totals shows B the time of A'; end if;

  -- user_id is filled in automatically; rows in the name of A are refused.
  insert into public.courses (goal) values ('Understand Newtonian mechanics')
  returning id, user_id into c, owner;
  if owner <> b then raise exception 'FAIL: course user_id not set to B'; end if;
  begin
    insert into public.courses (user_id, goal) values (current_setting('test.user_a')::uuid, 'x');
    raise exception 'FAIL: B created a course owned by A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lessons (course_id, position, week, title, summary)
    values (current_setting('test.course_a')::uuid, 2, 1, 'x', 'x');
    raise exception 'FAIL: B added a lesson to the course of A';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.course_messages (course_id, role, content)
    values (current_setting('test.course_a')::uuid, 'user', 'x');
    raise exception 'FAIL: B wrote into the chat of A';
  exception when foreign_key_violation then null;
  end;

  -- ai_usage is written by the server only.
  begin
    insert into public.ai_usage (user_id, task, model, ok) values (b, 'chat', 'x', true);
    raise exception 'FAIL: B could write ai_usage';
  exception when insufficient_privilege then null;
  end;

  -- save_course_plan: creates the deck and the lessons.
  perform public.save_course_plan(c, plan, 'test-model');
  select deck_id into d from public.courses
  where id = c and title = 'Mechanics' and planned_at is not null and plan_model = 'test-model';
  if d is null then raise exception 'FAIL: save_course_plan did not fill in the course'; end if;
  if not exists (select 1 from public.decks
                 where id = d and name = 'Mechanics' and subject = 'science' and target_lang is null) then
    raise exception 'FAIL: save_course_plan did not create the deck';
  end if;
  select count(*) into n from public.lessons where course_id = c;
  if n <> 3 then raise exception 'FAIL: expected 3 lessons, found %', n; end if;
  select id into l1 from public.lessons where course_id = c and position = 1 and title = 'First law';
  select id into l2 from public.lessons where course_id = c and position = 2;
  if l1 is null or l2 is null then raise exception 'FAIL: lessons are not in plan order'; end if;

  -- The course of A cannot be planned by B.
  begin
    perform public.save_course_plan(current_setting('test.course_a')::uuid, plan, 'x');
    raise exception 'FAIL: B planned the course of A';
  exception when no_data_found then null;
  end;

  -- save_lesson_content: explanation, items and their cards; a second call
  -- changes nothing.
  perform public.save_lesson_content(l1, '{"intro": "Bodies keep moving.", "key_points": ["No force, no change."]}',
    '[{"kind": "concept", "term": "inertia", "meaning": "resistance to a change of motion", "notes": ""},
      {"kind": "fact", "term": "first law", "meaning": "no net force means constant velocity", "notes": "Galileo"}]');
  select count(*) into n from public.items where lesson_id = l1 and deck_id = d;
  if n <> 2 then raise exception 'FAIL: expected 2 lesson items, found %', n; end if;
  if exists (select 1 from public.items where lesson_id = l1 and notes = '') then
    raise exception 'FAIL: empty notes were not stored as null';
  end if;
  select count(*) into n from public.cards c2 join public.items i2 on i2.id = c2.item_id
  where i2.lesson_id = l1;
  if n <> 4 then raise exception 'FAIL: expected 4 cards for the lesson items, found %', n; end if;
  if not exists (select 1 from public.lessons where id = l1 and prepared_at is not null
                 and explanation ->> 'intro' = 'Bodies keep moving.') then
    raise exception 'FAIL: save_lesson_content did not store the explanation';
  end if;
  perform public.save_lesson_content(l1, '{"intro": "changed", "key_points": []}',
    '[{"kind": "fact", "term": "extra", "meaning": "x", "notes": ""}]');
  select count(*) into n from public.items where deck_id = d;
  if n <> 2 or exists (select 1 from public.lessons where id = l1 and explanation ->> 'intro' = 'changed') then
    raise exception 'FAIL: a second save_lesson_content changed the lesson';
  end if;

  -- record_quiz_answer: appends an event without a card; the item must
  -- belong to the lesson.
  select id into i from public.items where lesson_id = l1 and term = 'inertia';
  perform public.record_quiz_answer(l1, i, false, '{"type": "choice", "value": "mass"}', now(), 1200);
  if not exists (select 1 from public.review_events
                 where lesson_id = l1 and item_id = i and card_id is null
                   and rating = 1 and correct = false) then
    raise exception 'FAIL: record_quiz_answer did not append the event';
  end if;
  -- Points: a wrong answer earns none; a correct typed answer earns 10 and
  -- is added to the day. 10 points do not reach the goal of 100.
  if (select points from public.daily_activity) <> 0 then
    raise exception 'FAIL: a wrong quiz answer earned points';
  end if;
  r := public.record_quiz_answer(l1, i, true,
    '{"type": "text", "value": "inertia", "exercise": "typed"}', now(), 900, null, 'Europe/Berlin');
  if (r ->> 'points')::int <> 10 or (r ->> 'points_today')::int <> 10
     or (r ->> 'points_goal')::int <> 100 or (r ->> 'goal_reached')::boolean
     or (r ->> 'reviews_today')::int <> 0 then
    raise exception 'FAIL: record_quiz_answer returned %', r;
  end if;
  -- The points goal alone makes the day count (lowered to 20: 10 + 15 for a built sentence).
  update public.profiles set daily_points = 20;
  r := public.record_quiz_answer(l1, i, true,
    '{"type": "text", "value": "x", "exercise": "build"}', now(), 900, null, 'Europe/Berlin');
  if (r ->> 'points')::int <> 15 or (r ->> 'points_today')::int <> 25
     or not (r ->> 'goal_reached')::boolean
     or not exists (select 1 from public.daily_activity
                    where reviews = 0 and points = 25 and points_goal = 20 and goal_met_at is not null) then
    raise exception 'FAIL: the points goal did not complete the day: %', r;
  end if;
  begin
    perform public.record_quiz_answer(l2, i, true, '{"type": "text", "value": "x"}', now());
    raise exception 'FAIL: a quiz answer was recorded for an item of another lesson';
  exception when no_data_found then null;
  end;
  begin
    insert into public.review_events (item_id, rating, reviewed_at) values (i, 3, now());
    raise exception 'FAIL: an event without card and lesson was accepted';
  exception when check_violation then null;
  end;

  -- Quiz answers are still append-only and are not counted as card reviews.
  begin
    update public.review_events set rating = 4;
    raise exception 'FAIL: review_events could be updated';
  exception when insufficient_privilege then null;
  end;
  if (public.review_stats('UTC', array['recognition', 'production'], 1) -> 'today' ->> 'reviews')::int <> 0 then
    raise exception 'FAIL: review_stats counts quiz answers as reviews';
  end if;

  -- A new plan keeps the started lesson and replaces the others.
  perform public.save_course_plan(c, jsonb_set(plan, '{lessons}',
    '[{"title": "Momentum", "summary": "p = mv.", "objectives": ["Define momentum"], "week": 2, "stage": 0}]'),
    'test-model');
  select count(*) into n from public.lessons where course_id = c;
  if n <> 2 then raise exception 'FAIL: after re-planning expected 2 lessons, found %', n; end if;
  if not exists (select 1 from public.lessons where id = l1 and prepared_at is not null)
     or not exists (select 1 from public.lessons where course_id = c and position = 2 and title = 'Momentum') then
    raise exception 'FAIL: re-planning did not keep the started lesson and append the new one';
  end if;
  select count(*) into n from public.decks;
  if n <> 1 then raise exception 'FAIL: re-planning created a second deck'; end if;
  select count(*) into n from public.review_events where lesson_id = l1;
  if n <> 3 then raise exception 'FAIL: re-planning lost quiz answers'; end if;

  -- Focus time: a project is a course of kind 'project'; time is booked on
  -- it, counted by focus_totals, and cannot be changed or deleted.
  insert into public.courses (goal, title, kind, weekly_minutes) values ('Work', 'Work', 'project', 600)
  returning id into owner;  -- reused as the project's id
  insert into public.focus_time (course_id, started_at, ended_at)
  values (owner, now() - interval '30 minutes', now() - interval '5 minutes'),
         (c, now() - interval '2 minutes', now() - interval '1 minute');
  if (select week_ms from public.focus_totals('Europe/Berlin', (now() at time zone 'Europe/Berlin')::date)
      where course_id = owner) <> 1500000
     or (select today_ms from public.focus_totals('Europe/Berlin', (now() at time zone 'Europe/Berlin')::date)
         where course_id = c) <> 60000 then
    raise exception 'FAIL: focus_totals counts the time wrongly';
  end if;
  begin
    insert into public.focus_time (course_id, started_at, ended_at)
    values (current_setting('test.course_a')::uuid, now() - interval '1 minute', now());
    raise exception 'FAIL: B booked time on the course of A';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.focus_time (course_id, started_at, ended_at)
    values (owner, now() - interval '7 hours', now());
    raise exception 'FAIL: a stretch of more than 6 hours was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.focus_time set ended_at = now() + interval '1 hour';
    raise exception 'FAIL: focus_time could be updated';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.focus_time;
    raise exception 'FAIL: focus_time could be deleted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.courses set focus_links = '{"url": "x"}' where id = owner;
    raise exception 'FAIL: focus_links accepted something that is not a list';
  exception when check_violation then null;
  end;
  -- Deleting the project deletes its time.
  delete from public.courses where id = owner;
  select count(*) into n from public.focus_time;
  if n <> 1 then raise exception 'FAIL: deleting a project left % rows of focus time', n - 1; end if;

  -- Chat messages can be added but not edited.
  insert into public.course_messages (course_id, role, content) values (c, 'user', 'original');
  update public.course_messages set content = 'edited';
  if exists (select 1 from public.course_messages where content = 'edited') then
    raise exception 'FAIL: a chat message could be edited';
  end if;
end $$;

-- Logged-out visitors (anon role) see nothing and cannot call the functions.
reset role;
set local role anon;
do $$
declare
  n int;
begin
  select count(*) into n from public.courses;
  if n <> 0 then raise exception 'FAIL: anon can see % courses', n; end if;
  select count(*) into n from public.lessons;
  if n <> 0 then raise exception 'FAIL: anon can see % lessons', n; end if;
  select count(*) into n from public.course_messages;
  if n <> 0 then raise exception 'FAIL: anon can see % chat messages', n; end if;
  select count(*) into n from public.ai_usage;
  if n <> 0 then raise exception 'FAIL: anon can see % rows of AI usage', n; end if;
  begin
    select count(*) into n from public.focus_time;
    if n <> 0 then raise exception 'FAIL: anon can see % rows of focus time', n; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.focus_totals('UTC', current_date);
    raise exception 'FAIL: anon can call focus_totals';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_course_plan(gen_random_uuid(), '{}', 'x');
    raise exception 'FAIL: anon can call save_course_plan';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_quiz_answer(gen_random_uuid(), gen_random_uuid(), true, '{"type": "text"}', now());
    raise exception 'FAIL: anon can call record_quiz_answer';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'all course RLS checks passed' as result;

rollback;
