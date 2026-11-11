-- record_review: saves one card review in a single transaction:
--   1. writes the card's new FSRS schedule (computed in the app by ts-fsrs),
--   2. appends the review event,
--   3. marks the item as introduced on its first review.
-- security invoker (the default): runs as the calling user, so Row Level
-- Security applies; another user's card is simply "not found".

create function public.record_review(
  p_card_id uuid,
  p_rating smallint,
  p_reviewed_at timestamptz,
  p_schedule jsonb,              -- the scheduling columns of cards, by column name
  p_correct boolean default null,
  p_response jsonb default null, -- e.g. {"type": "text", "value": "..."}
  p_duration_ms int default null,
  p_device_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item_id uuid;
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
end;
$$;

revoke execute on function public.record_review(uuid, smallint, timestamptz, jsonb, boolean, jsonb, int, text)
  from public, anon;
grant execute on function public.record_review(uuid, smallint, timestamptz, jsonb, boolean, jsonb, int, text)
  to authenticated;
