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
`review_events` and `course_messages` have no `updated_at` (rows never
change); `ai_usage` can only be read by its owner (the server writes it).

## Content

### decks
A collection the user studies, e.g. "Korean".

| column | type | note |
|---|---|---|
| name | text | |
| subject | text | 'language', 'science' or 'general' (set by a course's plan) |
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
| lesson_id | uuid null | the lesson that introduced the item; deleting the lesson keeps the item |

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

Cards are created by a trigger on items: recognition and production for every
item, plus listening for vocab items. A new listening card is shown only once
the item's recognition card has graduated (state review or relearning);
after that it follows its own schedule.

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

## Courses

### courses
A goal turned into a plan. See "Courses" in SPEC.md.

| column | type | note |
|---|---|---|
| kind | text | 'guided' (default) or 'study': a university course with uploaded material and homework |
| goal | text | what the learner typed (max 2000 characters) |
| level | text null | what they already know |
| weeks | int null | wanted duration; null = the planner decides |
| minutes_per_day | int | default 20 |
| source_id | uuid null | pasted material (`sources`, kind 'paste') |
| deck_id | uuid null | the deck holding the course's items; created with the first plan |
| title, summary | text null | from the plan |
| roadmap | jsonb null | stages: `[{"title", "outcome"}]` |
| scheduled | boolean | default true; false = no week schedule, lessons in order at the learner's pace |
| planned_at | timestamptz null | null = no plan yet |
| plan_model | text null | model that wrote the current plan |

### lessons

| column | type | note |
|---|---|---|
| course_id | uuid | |
| position | int | order within the course |
| stage | int | index into `courses.roadmap` |
| week | int | timeline: week of the course, from 1; not shown when the course is not scheduled |
| title, summary | text | |
| objectives | jsonb | list of strings |
| explanation | jsonb null | `{"lang", "steps": [{"title", "parts": [{"text", "target"}], "example": {"text", "note"} or null}], "key_points": [...]}`; written once. Each step is one card of the introduction: a headline, the idea in one sentence (`parts`) and one example with its translation or what it shows (`note`). `lang` is the language of the text, `target` marks text in the language being learned (for reading aloud). Older lessons have steps with `parts` only (longer, spoken-style text), and lessons prepared before 2026-11-16 have `{"intro", "key_points"}`; the app shows all three |
| prepared_at | timestamptz null | null = not started, no items yet |
| learned_at | timestamptz null | first time the guided run ("Learn") was finished |
| material_refs | jsonb null | study courses: the sections of the material this lesson is written from, `[{"source", "index"}]` |
| material_at | timestamptz null | when those sections were chosen; material read later makes the choice stale |
| practice | jsonb null | latest practice: `{"questions": [{"item_id", "kind": "choice", "typed" or "build", "prompt", "options", "answer", "explanation"}]}`; for "build", `answer` is the sentence and `options` the extra wrong words. Practice written before 2026-11-16 also has `examples`, which the app no longer shows |
| practice_at | timestamptz null | |
| completed_at | timestamptz null | first finished practice session |

The jsonb shapes and their validators are defined once, in
`supabase/functions/_shared/course-schemas.ts`, used by the Edge Function
(to validate model output) and by the app (as types).

AI-written content is stored only through these database functions, called
by the Edge Function after validation:
- `save_course_plan(course, plan, model)`: creates the deck on the first
  plan, fills in the course, deletes the lessons not yet started and appends
  the new ones after the kept ones.
- `save_lesson_content(lesson, explanation, items)`: stores the explanation
  and creates the items (their cards come from the items trigger). Does
  nothing if the lesson is already prepared. A term the deck already has is
  skipped.

### course_messages
The tutor chat per course: `course_id`, `role` ('user', 'assistant'),
`content`, `plan_change` null (on a tutor message that proposes a change: the
instruction given to the planner when the learner agrees). Read, insert and
delete only.

## Learning record

### review_events (append-only)

| column | type | note |
|---|---|---|
| card_id | uuid null | set for card reviews |
| lesson_id | uuid null | set for quiz answers of a lesson; exactly one of card_id and lesson_id is set |
| exercise_id | uuid null | set for exercises; column added in M4 |
| item_id | uuid | one row per item involved |
| rating | smallint | 1 again, 2 hard, 3 good, 4 easy |
| correct | boolean null | null when the answer was not checked automatically |
| response | jsonb null | `{"type":"text","value":"..."}` or `{"type":"choice","value":"..."}` now; later `{"type":"drawing","drawing_id":"..."}` |
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
`daily_activity` (through `count_activity`). The app does not write these
separately.

Quiz answers are saved through `record_quiz_answer` (lesson, item, correct,
response, time): one event with rating 3 (correct) or 1 (wrong) and no card.
They count towards proficiency but do not move a card's schedule, and they
are not counted as reviews by the statistics or the reviews goal. They do
earn points for their day (see `daily_activity`); `response.exercise` says
which kind of exercise it was, which decides the points.

What an answer is worth is decided by the database function
`event_points(card_type, exercise, rating, correct)` and nowhere else: card
reviews not rated "again" earn 5 (recognition) or 10 (production,
listening); correct practice answers earn 2 (match, per pair), 5 (choice,
listen), 10 (typed) or 15 (build).

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
| points | int | points earned that day, by reviews and practice answers |
| points_goal | int | points needed that day; follows `profiles.daily_points` until met, then fixed |
| goal_met_at | timestamptz null | when the first of the two goals (reviews or points) was reached; null = not reached |

Written only by `count_activity`, which `record_review` and
`record_quiz_answer` call in the same transaction as the event. The app
passes the device's time zone (`p_time_zone`); an unknown name falls back
to `profiles.timezone`. Both functions return
`{"reviews_today", "goal", "points", "points_today", "points_goal", "goal_reached"}`:
`points` is what this answer earned, and `goal_reached` is true only for
the answer that reached the first of the two goals, which shows the
celebration. The total of all points is the sum of `points` over the days.
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
One row per AI call: `connection_id` (null while the server's own key is
used), `task` ('plan_course', 'prepare_lesson', 'generate_practice', 'chat';
later 'generate_items', 'grade_answer'), `model`, `input_tokens`,
`output_tokens`, `cost_estimate` (US dollars, null if the price is unknown),
`ok`. No prompt or response text. A call whose answer failed validation is
logged with `ok` false. Written only by the Edge Function with the service
role; the owner can read it. It also backs the daily limit per user.

## Profile

### profiles
`user_id` (primary key), `display_name`, `timezone` (IANA name, default
'UTC'; the app keeps it equal to the device's), `reminder_time`,
`daily_goal` (reviews per day, default 20), `daily_points` (points per day,
default 100; reaching either goal completes the day), `push_token` null.
Created automatically for each new user by the `on_auth_user_created`
trigger.

## Open questions

- Shared decks between users (friends stage): copy on share, or shared rows?
- Conflict handling when two devices review the same card before syncing:
  events merge safely (append-only); card state is recomputed from events.

### sources: files of a course

Since study courses, a source can be an uploaded file of a course:

| column | type | note |
|---|---|---|
| course_id | uuid null | the course the file belongs to; deleted with the course |
| storage_path | text null | unused since files are stored in parts |
| part_paths | text[] | the file's parts in the Storage bucket `uploads`, in order: a photo is one part, a PDF is cut into parts of four pages |
| parts_read | int | how many parts AI has read into `text` so far |
| mime_type | text null | |
| role | text null | 'material', 'exercises' or 'notes', as AI judged the file |
| read_at | timestamptz null | when the last part was read; null = not (completely) read yet |

### homework

One task and the learner's handwritten solution, with what AI read and found.

| column | type | note |
|---|---|---|
| course_id | uuid | |
| task | text null | typed, or read by AI from `task_path`; one of the two is set |
| task_path | text null | photo of the task in Storage |
| solution_paths | text[] | photos of the solution, in page order (at most 6) |
| mode | text | 'check' (grade it) or 'hint' (help with the next step) |
| transcription | text null | the solution as AI read it |
| result | jsonb null | `{"verdict": "correct", "partly", "wrong", "unreadable" or "open", "score": 0..100, "summary", "steps": [{"text", "ok", "comment"}], "hint"}` |
| model | text null | |
| checked_at | timestamptz null | null = not checked yet |

### Storage bucket `uploads`

Private, 10 MB per file, JPEG, PNG, WebP and PDF only. A file's path is
`<user id>/<course id>/<unique name>`; the policies on `storage.objects`
allow reading, adding and deleting only inside the folder named after one's
own user id.

### decks: study settings

| column | type | note |
|---|---|---|
| active | boolean | default true; false = paused, not in the daily session |
| priority | boolean | default false; the learner's current priority |
| exam_date | date null | exam on the deck's content; changes ts-fsrs's maximum interval and desired retention until then |
