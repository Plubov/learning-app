-- Listening cards (M2): hear a word, type what you heard.
-- Every vocab item gets a third card. The app shows a new listening card
-- only after the item's recognition card has graduated (see
-- isListeningUnlocked in src/lib/review-session.ts).

create or replace function public.create_cards_for_new_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.cards (user_id, item_id, card_type)
  values
    (new.user_id, new.id, 'recognition'),
    (new.user_id, new.id, 'production');
  if new.kind = 'vocab' then
    insert into public.cards (user_id, item_id, card_type)
    values (new.user_id, new.id, 'listening');
  end if;
  return new;
end;
$$;

-- Existing vocab items of all users get their listening card once.
insert into public.cards (user_id, item_id, card_type)
select user_id, id, 'listening' from public.items where kind = 'vocab'
on conflict (item_id, card_type) do nothing;
