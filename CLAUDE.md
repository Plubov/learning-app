# Learning app (working title)

A cross-platform learning app built around spaced repetition and a per-user
knowledge model. First use case: the owner studying Korean. Later: physics and
general science, friends as testers, then app stores.

Read `docs/SPEC.md`, `docs/DATA_MODEL.md` and `docs/ROADMAP.md` before larger
changes. `docs/ROADMAP.md` says which milestone is current.

## About the developer

Carlos knows Python and Java but is new to web and app development. When you
introduce a concept, tool or file for the first time, explain in two or three
sentences what it is and why it is needed. Prefer the simplest solution that
works; do not add libraries or infrastructure without saying why.

## Stack

- App: Expo (React Native) with TypeScript, one codebase for Android, iOS, web
- Navigation: Expo Router
- Backend: Supabase (Postgres, Auth, Row Level Security, Storage, Edge Functions)
- Scheduling: FSRS via the `ts-fsrs` package
- AI: provider-agnostic layer, called only from Supabase Edge Functions

## Rules that must not be broken

1. `review_events` is append-only. Never update or delete rows in it. Mastery
   and statistics are derived from it.
2. Every table has Row Level Security enabled, with policies restricting rows
   to `auth.uid() = user_id`. A table without policies is a bug.
3. No AI provider key ever reaches the client. AI calls go through Edge
   Functions. User-supplied keys are stored encrypted, never logged.
4. App code never names a specific AI provider. It calls the internal AI
   interface (`generateItems`, `generateExercises`, `gradeAnswer`); provider
   adapters live behind it.
5. AI output is validated against a schema before it is stored. Invalid output
   is rejected, never saved.
6. Every AI call writes one row to `ai_usage`.
7. Scheduling uses `ts-fsrs`. Do not write a custom scheduling algorithm.
8. Database changes are made only as migration files in `supabase/migrations/`,
   never by hand in the dashboard.
9. Secrets live in `.env` files that are listed in `.gitignore`.
10. A learner's answer is stored as structured data (`response` is jsonb with
    a `type` field), never as bare text, so handwritten answers can be added
    later without changing the table.

## Working conventions

- TypeScript strict mode; no `any` without a comment explaining it.
- Small commits with clear messages; one topic per commit.
- Scheduling and mastery logic are pure functions with unit tests.
- Korean text is handled as Unicode NFC; compare typed answers after
  normalising and trimming.
- When a decision changes the spec or data model, update the file in `docs/`
  in the same commit.

## Commands

To be filled in once the project is scaffolded (milestone M0):
start dev server, run tests, run type check, apply migrations.
