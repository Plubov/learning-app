-- import_items: keep the order of the file. All rows of one transaction get
-- the same now(), so each item's created_at is moved forward by its position
-- in microseconds; new words are then introduced in file order.
-- Otherwise unchanged from 20261112222509_sources_and_import.sql;
-- create or replace keeps the execute grants.

create or replace function public.import_items(
  p_deck_id uuid,
  p_title text,
  p_text text,
  p_items jsonb  -- [{"term": "물", "meaning": "Wasser"}, ...]
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_added int;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 5000 then
    raise exception 'p_items must be an array of at most 5000 items'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.sources (kind, title, text)
  values ('import', p_title, p_text)
  returning id into v_source_id;

  insert into public.items (deck_id, kind, term, meaning, source_id, created_at)
  select p_deck_id, 'vocab', x.term, x.meaning, v_source_id,
         now() + x.position * interval '1 microsecond'
  from rows from (jsonb_to_recordset(p_items) as (term text, meaning text))
       with ordinality as x(term, meaning, position)
  on conflict (deck_id, kind, term) do nothing;
  get diagnostics v_added = row_count;

  return v_added;
end;
$$;
