-- Every new item gets its cards automatically, in the same transaction as
-- the item itself, whichever way it was added (by hand, import, AI).
-- M1: recognition and production. Listening cards are added in M2.
--
-- security invoker (the default): the function runs as the user who inserted
-- the item, so the cards pass the same RLS checks as any other insert.

create function public.create_cards_for_new_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.cards (user_id, item_id, card_type)
  values
    (new.user_id, new.id, 'recognition'),
    (new.user_id, new.id, 'production');
  return new;
end;
$$;

revoke execute on function public.create_cards_for_new_item() from public, anon, authenticated;

create trigger items_create_cards after insert on public.items
  for each row execute function public.create_cards_for_new_item();
