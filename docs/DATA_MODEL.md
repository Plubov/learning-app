# Data model

Status: draft 1, 2026-11-11. Postgres (Supabase).

Conventions for every table:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null default auth.uid() references auth.users on delete cascade`
  (owner; filled in by the database, the app does not send it)
- `created_at timestamptz default now()`, `updated_at timestamptz` (kept
  current by the `set_updated_at` trigger)
- Row Level Security on; policy: `auth.uid() = user_id` for all operations
- A child row references its parent as `(parent_id, user_id)`, so it can only
  point at a row of the same user (plain foreign keys bypass RLS)
- Learner-facing text must be NFC-normalised; the database rejects other
  input (`term is nfc normalized`)

Exceptions: `profiles` uses `user_id` as primary key (one row per user);
`review_events` has no `updated_at` (rows never change).

## Content

### decks
A collection the user studies, e.g. "Korean".

| column | type | note |
|---|---|---|
| name | text | |
| subject | text | 'language' now; 'science' later |
| target_lang | text | e.g. 'ko'; null for non-language decks |
| new_per_day | int | cap on new items per day |

Daily limit: an item counts as introduced on the first review of any of its
cards (`items.introduced_at`). A session shows the due cards of introduced
items, plus the cards of the oldest not-yet-introduced items, up to
`new_per_day` minus the items introduced since local midnight. "Learn more"
in the app adds 10 items beyond that for the current session.

Order of new items: `new_position`, then `created_at`. Imports compute the
order in the app (`src/lib/learning-order.ts`): sections of the file are
spread evenly so similar words (colours, left/right) are not learned on the
same day, and a phrase comes after the words it contains. Word frequency is
not used yet (planned with AI levels in M3).

### items
The unit of knowledge.

| column | type | note |
|---|---|---|
| deck_id | uuid | |
| kind | text | 'vocab', 'grammar'; later 'fact', 'concept', 'method' |
| term | text | Korean word or name of the grammar point |
| meaning | text | translation or explanation |
| notes | text | example, usage hint |
| source_id | uuid null | where it came from |
| introduced_at | timestamptz null | null = not yet shown to the learner |
| new_position | int null | place in the deck's queue of new words (lower = sooner); null for words added by hand, which come first |

Unique on (deck_id, kind, term) to prevent duplicates on import.

### item_links
Prerequisites: `from_item_id` must be known before `to_item_id`.
Unused for Korean vocabulary; needed for grammar and science.

### cards
One way of testing an item, with its own schedule.

| column | type | note |
|---|---|---|
| item_id | uuid | |
| card_type | text | 'recognition', 'production', 'listening'; later 'writing' |
| due_at | timestamptz | next review |
| stability | float | FSRS |
| stability_fast | float | FSRS-7 |
| difficulty | float | FSRS |
| scheduled_days | float | FSRS: interval in (fractional) days |
| learning_step | int | FSRS: position in the (re)learning steps |
| state | smallint | FSRS: 0 new, 1 learning, 2 review, 3 relearning |
| schedule_status | text | FSRS: 'new', 'learning', 'review' |
| reps | int | |
| lapses | int | |
| last_review_at | timestamptz null | |
| suspended | boolean | |

The FSRS columns mirror the card of `ts-fsrs` 6 `DefaultScheduler` (model
FSRS-7), in snake_case; the card's `cardId` is the row's `id`. Conversion
lives in `src/lib/scheduling.ts`. Recheck when upgrading `ts-fsrs`.
Unique on (item_id, card_type). Index on (user_id, due_at) for the "what is
due" query.

### exercises
A task touching several items.

| column | type | note |
|---|---|---|
| deck_id | uuid | |
| exercise_type | text | 'cloze', 'translation' |
| prompt | jsonb | what is shown |
| answer | jsonb | reference answer(s) |
| generated_by | text null | model id if AI-generated |

### exercise_items
Join table: which items an exercise involves, and `role`
('target' or 'context').

### sources
Pasted text, imports, later uploaded files.
`kind` ('paste', 'import', 'file'), `title`, `storage_path` null, `text` null.

An import keeps the complete file in `text`, including the parts that were
not turned into items (e.g. RemNote grammar cards, kept for M4).
`items.source_id` references `(id, user_id)`; deleting a source keeps its
items and only clears `source_id`.

Imports are saved through the database function `import_items` (deck, title,
file text, list of `{term, meaning}` in learning order). In one transaction
it reuses or creates the source, adds new vocab items with positions after
the deck's last `new_position`, and gives words already in the deck but not
yet introduced their new position (meanings are never changed). Importing a
file again therefore re-orders the words not yet learned. Returns
`{"added": n, "requeued": m}`. The items trigger creates the cards.

## Learning record

### review_events (append-only)

| column | type | note |
|---|---|---|
| card_id | uuid | set for card reviews (not null until exercises exist) |
| exercise_id | uuid null | set for exercises; column added in M4 |
| item_id | uuid | one row per item involved |
| rating | smallint | 1 again, 2 hard, 3 good, 4 easy |
| correct | boolean null | null when the answer was not checked automatically |
| response | jsonb null | `{"type":"text","value":"..."}` now; later `{"type":"drawing","drawing_id":"..."}` |
| duration_ms | int | |
| reviewed_at | timestamptz | time on the device |
| device_id | text | for sync debugging |

No update or delete policy exists for this table, and the API roles have no
UPDATE or DELETE privilege on it. Rows only disappear by cascade when the
whole account is deleted.
An exercise with three items writes three rows.

Card reviews are saved through the database function `record_review`, which
in one transaction updates the card's schedule, appends the event, sets
`items.introduced_at` on the first review and updates the day's row in
`daily_activity`. The app does not write these separately.

The statistics screen reads its numbers from the database function
`review_stats` (time zone, card types, number of days). It only reads and
returns one jsonb value: today's reviews, "again" answers, study time and new
words; reviews per day; items not started / learning / known (known = every
card of the item in FSRS state review); cards due tomorrow and in the next
7 days. Days are counted in the device's time zone. Counting happens in
Postgres because the API returns at most 1000 rows per request.

### drawings (handwriting phase; not created before then)

| column | type | note |
|---|---|---|
| purpose | text | 'answer', 'note' |
| item_id / deck_id / source_id | uuid null | what a note is attached to |
| strokes | jsonb | list of strokes; each a list of points (x, y, t, pressure) |
| width, height | int | canvas size the strokes refer to |
| recognized_text | text null | result of handwriting recognition |
| image_path | text null | rendered image in Storage, if one was needed |

Large notes move their strokes to a file in Storage; the row keeps the path.

### item_mastery (view, later a materialised table)
Per (user_id, item_id): number of events, recent accuracy, estimated recall
probability from the FSRS state of its cards, last seen. Computed, never
edited directly.

### daily_activity
One row per (user_id, local_date), a summary of review_events for the daily
goal and streak (it could be rebuilt from the events).

| column | type | note |
|---|---|---|
| local_date | date | the day in the learner's time zone |
| time_zone | text | IANA name the day was counted in, so travel does not break streaks |
| reviews | int | reviews that day |
| new_items | int | items introduced that day |
| duration_ms | bigint | sum of answer times |
| goal | int | reviews needed that day; follows `profiles.daily_goal` until met, then fixed |
| goal_met_at | timestamptz null | when the goal was reached; null = not reached |

Written only by `record_review`, in the same transaction as the review. The
app passes the device's time zone (`p_time_zone`); an unknown name falls back
to `profiles.timezone`. `record_review` returns
`{"reviews_today", "goal", "goal_reached"}`; `goal_reached` is true only for
the review that reached the goal, which shows the celebration.
No delete policy: the history only disappears with the account.

The streak is computed in the app (`src/lib/streak.ts`): days in a row with
`goal_met_at` set, ending today, or ending yesterday while today's goal is
not met yet.

## AI

### ai_connections

| column | type | note |
|---|---|---|
| kind | text | 'api_key', 'openrouter', 'openai_compatible', 'managed' |
| provider | text | 'anthropic', 'openai', ... |
| base_url | text null | for openai_compatible |
| model | text | model id chosen by the user |
| secret_ref | text | reference to the encrypted key; the key itself is not in this table |
| is_default | boolean | |
| accepts_images | boolean | needed for grading handwritten work |

### ai_usage
One row per AI call: `connection_id`, `task` ('generate_items',
'generate_exercises', 'grade_answer'), `model`, `input_tokens`,
`output_tokens`, `cost_estimate`, `ok`. No prompt or response text.

## Profile

### profiles
`user_id` (primary key), `display_name`, `timezone` (IANA name, default
'UTC'; the app keeps it equal to the device's), `reminder_time`,
`daily_goal` (reviews per day, default 20), `push_token` null.
Created automatically for each new user by the `on_auth_user_created`
trigger.

## Open questions

- Shared decks between users (friends stage): copy on share, or shared rows?
- Conflict handling when two devices review the same card before syncing:
  events merge safely (append-only); card state is recomputed from events.
