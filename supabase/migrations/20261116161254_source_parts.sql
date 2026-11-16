-- An uploaded file is read by AI in parts. One call for a whole PDF chapter
-- ran longer than an Edge Function may (150 seconds) and was cut off. The
-- app now splits a PDF into parts of a few pages before upload; each part is
-- read in its own short call, and reading can stop and continue.

alter table public.sources
  -- The parts of the file in Storage, in order. A photo is one part.
  add column part_paths text[] not null default '{}',
  -- How many parts have been read into `text` so far. All read = read_at set.
  add column parts_read int not null default 0 check (parts_read >= 0);
