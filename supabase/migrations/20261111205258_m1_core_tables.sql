-- M1 core tables: profiles, decks, items, cards, review_events.
-- See docs/DATA_MODEL.md. Every table has Row Level Security restricting rows
-- to their owner. review_events is append-only.

-- Shared trigger function: keeps updated_at current on every UPDATE.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-------------------------------------------------------------------------------
-- profiles: one row per user, created automatically on sign-up.
-------------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',  -- IANA name, e.g. 'Europe/Berlin'
  reminder_time time,
  daily_goal int check (daily_goal > 0),
  push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner can read" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: owner can insert" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles: owner can update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profiles: owner can delete" on public.profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile when a user signs up. Runs as the function owner
-- (security definer) because the new user is not logged in yet.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users who signed up before this migration.
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-------------------------------------------------------------------------------
-- decks
-------------------------------------------------------------------------------
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  subject text not null default 'language' check (subject in ('language', 'science')),
  target_lang text,  -- e.g. 'ko'; null for non-language decks
  new_per_day int not null default 10 check (new_per_day >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets child tables reference (id, user_id), so a row can only point at
  -- a parent owned by the same user.
  unique (id, user_id)
);

create index decks_user_id_idx on public.decks (user_id);

alter table public.decks enable row level security;

create policy "decks: owner can read" on public.decks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "decks: owner can insert" on public.decks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "decks: owner can update" on public.decks
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "decks: owner can delete" on public.decks
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger decks_set_updated_at before update on public.decks
  for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- items: the unit of knowledge (a word or grammar point).
-------------------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id uuid not null,
  kind text not null check (kind in ('vocab', 'grammar', 'fact', 'concept', 'method')),
  -- Text must arrive NFC-normalised so equal Hangul is stored identically.
  term text not null check (length(trim(term)) > 0 and term is nfc normalized),
  meaning text not null check (meaning is nfc normalized),
  notes text check (notes is nfc normalized),
  source_id uuid,  -- foreign key added when the sources table exists
  introduced_at timestamptz,  -- null = not yet shown to the learner
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (deck_id, user_id) references public.decks (id, user_id) on delete cascade,
  unique (deck_id, kind, term),
  unique (id, user_id)
);

create index items_user_id_idx on public.items (user_id);

alter table public.items enable row level security;

create policy "items: owner can read" on public.items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "items: owner can insert" on public.items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "items: owner can update" on public.items
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "items: owner can delete" on public.items
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger items_set_updated_at before update on public.items
  for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- cards: one way of testing an item, with its own FSRS schedule.
-- FSRS columns mirror the Card type of ts-fsrs 6.0.0.
-------------------------------------------------------------------------------
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null,
  card_type text not null check (card_type in ('recognition', 'production', 'listening', 'writing')),
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  scheduled_days int not null default 0,
  learning_steps int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state smallint not null default 0 check (state between 0 and 3),  -- new, learning, review, relearning
  last_review timestamptz,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade,
  unique (item_id, card_type),
  unique (id, user_id)
);

-- For "which cards are due for me now".
create index cards_user_id_due_idx on public.cards (user_id, due);

alter table public.cards enable row level security;

create policy "cards: owner can read" on public.cards
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "cards: owner can insert" on public.cards
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "cards: owner can update" on public.cards
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cards: owner can delete" on public.cards
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger cards_set_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- review_events: the learning record. APPEND-ONLY: rows are never updated or
-- deleted (except by cascade when the account itself is deleted).
-- exercise_id is added in M4 together with the exercises table.
-------------------------------------------------------------------------------
create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null,
  item_id uuid not null,
  rating smallint not null check (rating between 1 and 4),  -- again, hard, good, easy
  correct boolean,  -- null when the answer was not checked automatically
  -- Structured answer, e.g. {"type": "text", "value": "..."}.
  response jsonb check (response is null or jsonb_typeof(response -> 'type') = 'string'),
  duration_ms int check (duration_ms >= 0),
  reviewed_at timestamptz not null,  -- time on the device
  device_id text,
  created_at timestamptz not null default now(),
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade,
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);

create index review_events_user_id_reviewed_at_idx on public.review_events (user_id, reviewed_at);
create index review_events_card_id_idx on public.review_events (card_id);
create index review_events_item_id_idx on public.review_events (item_id);

alter table public.review_events enable row level security;

-- Only read and insert policies: with RLS on, UPDATE and DELETE are refused.
create policy "review_events: owner can read" on public.review_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "review_events: owner can insert" on public.review_events
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Belt and braces: the API roles lose the privilege to change rows at all.
revoke update, delete, truncate on public.review_events from anon, authenticated;
