-- Fix: the response check accepted JSON that is not an object (e.g. "apple").
-- For non-objects, response -> 'type' is NULL, and a CHECK that evaluates to
-- NULL counts as passed. coalesce turns NULL into '' so the check fails.
-- Found by supabase/tests/rls_m1.sql.

alter table public.review_events drop constraint review_events_response_check;

alter table public.review_events add constraint review_events_response_check
  check (response is null or coalesce(jsonb_typeof(response -> 'type'), '') = 'string');
