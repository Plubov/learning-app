-- Trigger functions must not be callable through the API (/rest/v1/rpc/...).
-- Flagged by `supabase db advisors`. Triggers still fire: Postgres does not
-- check EXECUTE privilege when it runs a trigger function itself.
--   handle_new_user: creates a profile on sign-up (ours).
--   rls_auto_enable: Supabase's event trigger that enables RLS on every new
--   table in public (installed with the project; kept as a safety net).

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
