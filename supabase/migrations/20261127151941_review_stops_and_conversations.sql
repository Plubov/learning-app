-------------------------------------------------------------------------------
-- Review stops and conversations, both kept on the lesson row (lessons
-- already has Row Level Security with owner-only policies for every action).
--
-- Review stops: after every third lesson of a course the path has a review
-- of everything learned so far. Which lessons come before a stop follows
-- from the lesson order (src/lib/review-stops.ts); stored is only when the
-- review after this lesson was first finished. When a re-plan replaces a
-- lesson that was not started, its mark goes with it, which is right: the
-- review after it is then a new one.
--
-- Conversations: a short dialogue per lesson of a language course, written
-- once by AI (task prepare_conversation, validated by
-- validateConversation), practised by speaking or typing.
-------------------------------------------------------------------------------
alter table public.lessons
  add column review_completed_at timestamptz,
  -- {"scenario", "partner", "turns": [{"item_id", "partner", "partner_translation", "answers", "hint"}]}
  add column conversation jsonb,
  add column conversation_at timestamptz;
