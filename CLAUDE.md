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

Run from the repository root. Expo SDK 58; see `AGENTS.md` for Expo-specific
guidance (always read the versioned Expo docs, not memory).

- Install dependencies: `npm install` (after cloning or pulling package changes)
- Add a package: `npx expo install <package>` (picks SDK-compatible versions)
- Start dev server: `npx expo start` (press `w` for web; scan the QR code with
  Expo Go on the phone; use `--tunnel` if the phone cannot reach the PC)
- Type check: `npx tsc --noEmit`
- Lint: `npx expo lint`
- Check dependency versions: `npx expo-doctor`
- Run tests: not set up yet (added in M1 with the scheduling logic)
- New migration: `npx supabase migration new <name>` (creates an empty file in
  `supabase/migrations/`; from a non-interactive shell add `< /dev/null`, or it
  waits for SQL on stdin)
- Apply migrations to the cloud project: `npx supabase db push --remote`
  (CLI v3 targets a local Docker database unless `--remote` is given)
- List applied migrations: `npx supabase migration list --remote`
- Database security checks (run after every migration):
  `npx supabase db query --remote -f supabase/tests/rls_m1.sql` (runs in a
  transaction that is rolled back; prints "all RLS checks passed") and
  `npx supabase db advisors --remote`
- One-time setup per machine: `npx supabase login`, then
  `npx supabase link --project-ref kwyrtvjirgqzzxzdxpqu` (asks for the
  database password)

Environment: copy `.env.example` to `.env` and fill in the Supabase URL and
publishable key. Restart `npx expo start` after changing `.env`.

Setting up another computer: see `docs/SETUP.md`.
