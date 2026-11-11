-- Align cards with the card shape of ts-fsrs 6 (DefaultScheduler, FSRS-7).
-- The first M1 migration mirrored the deprecated `Card` type of ts-fsrs.
-- Done before any real review exists, so only defaults are affected.
--
-- ts-fsrs field   -> column
--   dueAt          -> due_at
--   lastReviewAt   -> last_review_at
--   learningStep   -> learning_step
--   scheduledDays  -> scheduled_days (now fractional days)
--   stabilityFast  -> stability_fast (new; used by FSRS-7)
--   scheduleStatus -> schedule_status (new; 'new', 'learning', 'review')
--   stability, difficulty, state, reps, lapses: unchanged
--   cardId         -> the row's id

alter table public.cards rename column due to due_at;
alter table public.cards rename column last_review to last_review_at;
alter table public.cards rename column learning_steps to learning_step;
alter index public.cards_user_id_due_idx rename to cards_user_id_due_at_idx;

alter table public.cards alter column scheduled_days type double precision;

alter table public.cards
  add column stability_fast double precision not null default 0,
  add column schedule_status text not null default 'new'
    check (schedule_status in ('new', 'learning', 'review'));
