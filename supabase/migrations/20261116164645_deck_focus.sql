-- What the learner is studying right now, per deck. A course's cards are in
-- its deck, so these settings also serve courses.

alter table public.decks
  -- Whether the deck's cards are part of the daily review session. A paused
  -- deck keeps its cards and their schedule and can still be studied by
  -- choosing it.
  add column active boolean not null default true,
  -- The learner's current priority: its cards come first in a session, and
  -- its course is the one the home screen offers to continue.
  add column priority boolean not null default false,
  -- Day of an exam on the deck's content. Until then ts-fsrs is given a
  -- maximum interval (and, close to the exam, a higher desired retention),
  -- so every card comes back before the exam. See src/lib/exam.ts.
  add column exam_date date;
