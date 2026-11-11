-- Row Level Security checks for the M1 tables.
-- Run: npx supabase db query --remote -f supabase/tests/rls_m1.sql
-- Everything happens inside one transaction that is rolled back at the end,
-- so no test data remains. Any failed check aborts with "FAIL: ...".
-- Needs at least one real user in the project (user A).

begin;

-- Setup as admin: test user B, plus a deck owned by existing user A.
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-00000000000b', 'rls-test-b@example.invalid',
        'authenticated', 'authenticated');

do $$
declare
  a uuid;
  d uuid;
  i uuid;
  c uuid;
begin
  select id into a from auth.users
  where id <> '00000000-0000-4000-8000-00000000000b'
  order by created_at limit 1;
  if a is null then
    raise exception 'FAIL: needs one existing user (user A)';
  end if;
  insert into public.decks (user_id, name) values (a, 'RLS test deck of A') returning id into d;
  perform set_config('test.user_a', a::text, true);
  perform set_config('test.deck_a', d::text, true);
  insert into public.items (user_id, deck_id, kind, term, meaning)
  values (a, d, 'vocab', 'rls-test', 'x') returning id into i;
  select id into c from public.cards where item_id = i limit 1;
  perform set_config('test.card_a', c::text, true);

  if not exists (select 1 from public.profiles
                 where user_id = '00000000-0000-4000-8000-00000000000b') then
    raise exception 'FAIL: profile was not created on sign-up';
  end if;
end $$;

-- From here on act exactly like the app does for logged-in user B.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
declare
  b constant uuid := '00000000-0000-4000-8000-00000000000b';
  d uuid;
  owner uuid;
  i uuid;
  c uuid;
  n int;
begin
  if auth.uid() is distinct from b then
    raise exception 'FAIL: not acting as user B';
  end if;

  -- B sees only own rows.
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL: B sees % profiles, expected 1', n; end if;
  select count(*) into n from public.decks;
  if n <> 0 then raise exception 'FAIL: B can see the deck of A'; end if;

  -- user_id is filled in automatically.
  insert into public.decks (name, target_lang) values ('Korean', 'ko')
  returning id, user_id into d, owner;
  if owner <> b then raise exception 'FAIL: deck user_id not set to B'; end if;

  -- B cannot create rows in the name of A.
  begin
    insert into public.decks (user_id, name) values (current_setting('test.user_a')::uuid, 'x');
    raise exception 'FAIL: B created a deck owned by A';
  exception when insufficient_privilege then null;
  end;

  -- B cannot attach an item to the deck of A.
  begin
    insert into public.items (deck_id, kind, term, meaning)
    values (current_setting('test.deck_a')::uuid, 'vocab', '사과', 'apple');
    raise exception 'FAIL: B added an item to the deck of A';
  exception when foreign_key_violation then null;
  end;

  -- Non-NFC Hangul is rejected; NFC is accepted.
  begin
    insert into public.items (deck_id, kind, term, meaning)
    values (d, 'vocab', normalize('사과', nfd), 'apple');
    raise exception 'FAIL: non-NFC term was accepted';
  exception when check_violation then null;
  end;
  insert into public.items (deck_id, kind, term, meaning)
  values (d, 'vocab', '사과', 'apple') returning id into i;

  -- The items trigger creates the cards (as B, through RLS).
  select count(*) into n from public.cards where item_id = i;
  if n <> 2 then raise exception 'FAIL: expected 2 cards for new item, found %', n; end if;
  select id into c from public.cards where item_id = i and card_type = 'recognition';

  -- record_review updates the card, appends the event, marks the item introduced.
  perform public.record_review(
    p_card_id => c,
    p_rating => 3::smallint,
    p_reviewed_at => now(),
    p_schedule => '{"due_at": "2030-01-02T00:00:00Z", "last_review_at": "2030-01-01T00:00:00Z",
      "stability": 1.5, "stability_fast": 1.2, "difficulty": 5, "scheduled_days": 1,
      "learning_step": 0, "state": 2, "schedule_status": "review", "reps": 1, "lapses": 0}'::jsonb,
    p_correct => true,
    p_response => '{"type": "text", "value": "apple"}'::jsonb
  );
  if not exists (select 1 from public.cards
                 where id = c and state = 2 and reps = 1 and due_at = '2030-01-02T00:00:00Z') then
    raise exception 'FAIL: record_review did not update the card';
  end if;
  select count(*) into n from public.review_events where card_id = c and item_id = i;
  if n <> 1 then raise exception 'FAIL: record_review wrote % events, expected 1', n; end if;
  if exists (select 1 from public.items where id = i and introduced_at is null) then
    raise exception 'FAIL: record_review did not mark the item introduced';
  end if;

  -- B cannot review the card of A.
  begin
    perform public.record_review(
      p_card_id => current_setting('test.card_a')::uuid,
      p_rating => 3::smallint,
      p_reviewed_at => now(),
      p_schedule => '{"due_at": "2030-01-02T00:00:00Z", "stability": 1, "stability_fast": 1,
        "difficulty": 5, "scheduled_days": 1, "learning_step": 0, "state": 2,
        "schedule_status": "review", "reps": 1, "lapses": 0}'::jsonb
    );
    raise exception 'FAIL: B reviewed the card of A';
  exception when no_data_found then null;
  end;

  -- review_events: insert works, response needs a type, no update or delete.
  insert into public.review_events (card_id, item_id, rating, response, reviewed_at)
  values (c, i, 3, '{"type": "text", "value": "apple"}', now());

  begin
    insert into public.review_events (card_id, item_id, rating, response, reviewed_at)
    values (c, i, 3, '"apple"', now());
    raise exception 'FAIL: response without type was accepted';
  exception when check_violation then null;
  end;

  begin
    update public.review_events set rating = 1;
    raise exception 'FAIL: review_events could be updated';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.review_events;
    raise exception 'FAIL: review_events could be deleted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Logged-out visitors (anon role) see nothing.
reset role;
set local role anon;
do $$
declare
  n int;
begin
  select count(*) into n from public.decks;
  if n <> 0 then raise exception 'FAIL: anon can see % decks', n; end if;
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'FAIL: anon can see % profiles', n; end if;
end $$;

select 'all RLS checks passed' as result;

rollback;
