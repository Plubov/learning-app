-------------------------------------------------------------------------------
-- Listening flashcards are no longer typed: the learner hears the Korean,
-- recalls the meaning and rates it, like a recognition card. Typing what is
-- heard was the production card's task a second time.
--
-- So a flashcard's points now depend on whether an answer was typed and
-- checked (p_correct is set only then), not on the card type:
--   typed (production; listening reviews from before this change) 10,
--   only looked at (recognition, listening from now on) 5,
--   rated "again" 0.
-- Older events keep their value: every earlier listening review was typed
-- and has p_correct set, every recognition review has it null.
-- Practice exercises are unchanged.
-------------------------------------------------------------------------------
create or replace function public.event_points(
  p_card_type text,
  p_exercise text,
  p_rating smallint,
  p_correct boolean
)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_card_type is not null then
      case
        when p_rating <= 1 then 0
        when p_correct is null then 5
        else 10
      end
    when p_correct is not true then 0
    else case coalesce(p_exercise, 'choice')
      when 'match' then 2
      when 'choice' then 5
      when 'listen' then 5
      when 'typed' then 10
      when 'build' then 15
      else 5
    end
  end;
$$;
