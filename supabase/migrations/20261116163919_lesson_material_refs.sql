-- A lesson of a study course is no longer written from the course's whole
-- material, only from the sections of it that belong to the lesson. Which
-- ones is decided once per lesson by a small AI call and remembered here, so
-- the lesson's practice uses the same sections without asking again.

alter table public.lessons
  -- [{"source": "<sources.id>", "index": 3}, ...]: sections of the sources'
  -- text, as cut by splitSections (supabase/functions/_shared/material-sections.ts).
  add column material_refs jsonb,
  -- When the sections were chosen. Material read after this makes the choice
  -- stale, and it is made again.
  add column material_at timestamptz;
