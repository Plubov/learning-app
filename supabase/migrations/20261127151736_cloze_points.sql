-------------------------------------------------------------------------------
-- Points for the new kinds of exercise:
--   cloze  10  a sentence with a gap, filled by picking one of the options
--   talk   10  an answer spoken (or typed) in a simulated conversation
-- Everything else as in 20261127112504_flashcard_points_by_card_type:
--   card reviews, unless rated "again": recognition 5, listening 5 (10 if
--   typed: reviews from before 2026-11-27), production and others 10
--   practice exercises, when correct: match 2, choice and listen 5,
--   typed 10, build 15, anything else 5
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
        when p_card_type = 'recognition' then 5
        when p_card_type = 'listening' and p_correct is null then 5
        else 10
      end
    when p_correct is not true then 0
    else case coalesce(p_exercise, 'choice')
      when 'match' then 2
      when 'choice' then 5
      when 'listen' then 5
      when 'typed' then 10
      when 'cloze' then 10
      when 'talk' then 10
      when 'build' then 15
      else 5
    end
  end;
$$;
