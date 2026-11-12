-------------------------------------------------------------------------------
-- sources: where items came from (an import file, later pasted text and
-- uploads). The whole file text is kept, so parts that were not imported
-- (e.g. RemNote grammar cards, for M4) can be used later.
-------------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('paste', 'import', 'file')),
  title text not null check (length(trim(title)) > 0),
  storage_path text,  -- file in Storage, for uploads (later)
  text text check (text is nfc normalized and length(text) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index sources_user_id_idx on public.sources (user_id);

alter table public.sources enable row level security;

create policy "sources: owner can read" on public.sources
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "sources: owner can insert" on public.sources
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sources: owner can update" on public.sources
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sources: owner can delete" on public.sources
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger sources_set_updated_at before update on public.sources
  for each row execute function public.set_updated_at();

-- items.source_id now points at a source of the same user. Deleting the
-- source keeps the items and only clears source_id.
alter table public.items
  add constraint items_source_fkey foreign key (source_id, user_id)
  references public.sources (id, user_id) on delete set null (source_id);

create index items_source_id_idx on public.items (source_id);

-------------------------------------------------------------------------------
-- import_items: saves an import in one transaction:
--   1. the source with the complete file text,
--   2. the items (vocab), skipping terms the deck already has.
-- The cards are created by the items trigger. Returns the number of items
-- added. security invoker: RLS applies, so only the caller's own deck works.
-------------------------------------------------------------------------------
create function public.import_items(
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

  insert into public.items (deck_id, kind, term, meaning, source_id)
  select p_deck_id, 'vocab', x.term, x.meaning, v_source_id
  from jsonb_to_recordset(p_items) as x(term text, meaning text)
  on conflict (deck_id, kind, term) do nothing;
  get diagnostics v_added = row_count;

  return v_added;
end;
$$;

revoke execute on function public.import_items(uuid, text, text, jsonb) from public, anon;
grant execute on function public.import_items(uuid, text, text, jsonb) to authenticated;
