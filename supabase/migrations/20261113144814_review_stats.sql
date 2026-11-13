-- review_stats: numbers for the statistics screen, computed from the
-- learning record (review_events is only read, never changed).
-- security invoker (the default): runs as the calling user, so Row Level
-- Security applies and every count only sees that user's own rows.
--
-- p_time_zone   the device's IANA time zone (e.g. 'Europe/Berlin'); decides
--               where "today" and each day of the chart begin and end
-- p_card_types  the card types the app shows (cards of other types, e.g.
--               listening before it is built, are ignored)
-- p_days        length of the daily chart, ending today
--
-- Returns:
-- {
--   "today":  {"reviews": n, "again": n, "duration_ms": n, "new_items": n},
--   "days":   [{"date": "2026-11-13", "reviews": n, "again": n}, ...]  (oldest first)
--   "items":  {"not_started": n, "learning": n, "known": n},
--   "due":    {"tomorrow": n, "next_7_days": n}
-- }
-- An item is "known" once every one of its cards is in the FSRS review state
-- (state 2), i.e. it has passed the learning steps and not lapsed since.

create function public.review_stats(
  p_time_zone text,
  p_card_types text[],
  p_days int default 14
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := (now() at time zone p_time_zone)::date;
  v_today_start timestamptz := v_today::timestamp at time zone p_time_zone;
  -- Day boundaries come from local dates, so days with a daylight saving
  -- change (23 or 25 hours) are still counted correctly.
  v_tomorrow_start timestamptz := (v_today + 1)::timestamp at time zone p_time_zone;
  v_tomorrow_end timestamptz := (v_today + 2)::timestamp at time zone p_time_zone;
  v_week_end timestamptz := (v_today + 8)::timestamp at time zone p_time_zone;
  v_first_start timestamptz := (v_today - (p_days - 1))::timestamp at time zone p_time_zone;
  v_today_json jsonb;
  v_days jsonb;
  v_items jsonb;
  v_due jsonb;
begin
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'p_days must be between 1 and 366' using errcode = 'invalid_parameter_value';
  end if;

  select jsonb_build_object(
           'reviews', count(*),
           'again', count(*) filter (where e.rating = 1),
           'duration_ms', coalesce(sum(e.duration_ms), 0),
           'new_items', (select count(*) from public.items i
                         where i.introduced_at >= v_today_start))
    into v_today_json
  from public.review_events e
  where e.reviewed_at >= v_today_start;

  select jsonb_agg(jsonb_build_object(
           'date', d.day,
           'reviews', coalesce(r.reviews, 0),
           'again', coalesce(r.again, 0)) order by d.day)
    into v_days
  from (select v_today - n as day from generate_series(0, p_days - 1) as n) d
  left join (
    select (e.reviewed_at at time zone p_time_zone)::date as day,
           count(*) as reviews,
           count(*) filter (where e.rating = 1) as again
    from public.review_events e
    where e.reviewed_at >= v_first_start
    group by 1
  ) r on r.day = d.day;

  select jsonb_build_object(
           'not_started', count(*) filter (where s.introduced_at is null),
           'learning', count(*) filter (where s.introduced_at is not null and not s.all_review),
           'known', count(*) filter (where s.introduced_at is not null and s.all_review))
    into v_items
  from (
    select i.introduced_at,
           coalesce(bool_and(c.state = 2), false) as all_review
    from public.items i
    left join public.cards c
      on c.item_id = i.id and c.card_type = any (p_card_types) and not c.suspended
    group by i.id
  ) s;

  select jsonb_build_object(
           'tomorrow', count(*) filter (where c.due_at < v_tomorrow_end),
           'next_7_days', count(*))
    into v_due
  from public.cards c
  join public.items i on i.id = c.item_id
  where i.introduced_at is not null
    and not c.suspended
    and c.card_type = any (p_card_types)
    and c.due_at >= v_tomorrow_start
    and c.due_at < v_week_end;

  return jsonb_build_object('today', v_today_json, 'days', v_days, 'items', v_items, 'due', v_due);
end;
$$;

revoke execute on function public.review_stats(text, text[], int) from public, anon;
grant execute on function public.review_stats(text, text[], int) to authenticated;
