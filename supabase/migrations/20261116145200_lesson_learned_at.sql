-- When the learner first went through a lesson's guided run ("Learn") to its
-- end. Until now only practice left a mark (completed_at), so a lesson that
-- had been learned but not yet practised looked untouched.

alter table public.lessons
  add column learned_at timestamptz;  -- null = guided run not finished yet
