-- Learning order of new words. new_position is the place of a not yet
-- introduced item in the deck's queue (lower = sooner). Imports set it from
-- the order computed in the app (topics mixed, building blocks first).
-- Items added by hand have null and come before the queue.
alter table public.items add column new_position int;

-- import_items now:
--   - takes the items in learning order and gives them positions after the
--     deck's current last position,
--   - moves words already in the deck but not yet introduced to their new
--     position (importing a file again re-orders the words not yet learned),
--   - reuses the source when the same file text was imported before,
--   - returns {"added": n, "requeued": m}.
-- The return type changes, so the function is dropped and created again.
drop function public.import_items(uuid, text, text, jsonb);

create function public.import_items(
  p_deck_id uuid,
  p_title text,
  p_text text,
  p_items jsonb  -- [{"term": "물", "meaning": "Wasser"}, ...] in learning order, no duplicates
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_base int;
  v_added int;
  v_requeued int;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 5000 then
    raise exception 'p_items must be an array of at most 5000 items'
      using errcode = 'invalid_parameter_value';
  end if;

  select id into v_source_id from public.sources
  where kind = 'import' and text = p_text
  limit 1;
  if v_source_id is null then
    insert into public.sources (kind, title, text)
    values ('import', p_title, p_text)
    returning id into v_source_id;
  end if;

  select coalesce(max(new_position), 0) into v_base
  from public.items where deck_id = p_deck_id;

  with saved as (
    insert into public.items (deck_id, kind, term, meaning, source_id, new_position)
    select p_deck_id, 'vocab', x.term, x.meaning, v_source_id, v_base + x.position::int
    from rows from (jsonb_to_recordset(p_items) as (term text, meaning text))
         with ordinality as x(term, meaning, position)
    on conflict (deck_id, kind, term) do update
      set new_position = excluded.new_position
      where public.items.introduced_at is null
    -- xmax = 0 marks a newly inserted row; otherwise it was updated.
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
  into v_added, v_requeued
  from saved;

  return jsonb_build_object('added', v_added, 'requeued', v_requeued);
end;
$$;

revoke execute on function public.import_items(uuid, text, text, jsonb) from public, anon;
grant execute on function public.import_items(uuid, text, text, jsonb) to authenticated;
